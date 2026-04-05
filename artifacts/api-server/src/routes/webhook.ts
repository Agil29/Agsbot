import { Router } from "express";
import { logger } from "../lib/logger";
import { getTopupById, updateTopupStatus } from "../bot/topup";
import { updateSaldo } from "../bot/users";
import { createOrder } from "../bot/orders";
import { placeKhfyOrder } from "../bot/khfyApi";
import { placeDopuOrder, type DopuOrderResult } from "../bot/dopuApi";
import { getBot } from "../bot";

const router = Router();

router.post("/pakasir", async (req, res) => {
  const { order_id, amount, status, project } = req.body as {
    order_id?: string;
    amount?: number;
    status?: string;
    project?: string;
  };

  logger.info({ order_id, amount, status, project }, "Pakasir webhook received");

  if (!order_id || !status) {
    return res.status(400).json({ ok: false, message: "Missing fields" });
  }

  if (status !== "completed") {
    return res.json({ ok: true, message: "Ignored non-completed status" });
  }

  const topup = getTopupById(order_id);
  if (!topup) {
    logger.warn({ order_id }, "Topup not found for webhook");
    return res.status(404).json({ ok: false, message: "Order not found" });
  }

  if (topup.status === "completed") {
    return res.json({ ok: true, message: "Already processed" });
  }

  const expectedAmount = topup.nominal;
  if (amount !== undefined && Number(amount) < expectedAmount) {
    logger.warn({ order_id, amount, expectedAmount }, "Webhook amount mismatch");
    return res.status(400).json({ ok: false, message: "Amount mismatch" });
  }

  updateTopupStatus(order_id, "completed");
  const bot = getBot();

  if (topup.orderPayload) {
    const { sku, nomorTujuan, packageName, category, packageId, quota, validity } = topup.orderPayload;

    logger.info({ order_id, sku, nomorTujuan, category }, "Processing order payment via QRIS webhook");

    const useDopu = category === "akrab1" || category === "circle";
    const result = useDopu
      ? await placeDopuOrder({ sku, tujuan: nomorTujuan })
      : await placeKhfyOrder({ sku, tujuan: nomorTujuan });

    // Extract DOPU-specific fields safely
    const dopuResult = useDopu ? (result as DopuOrderResult) : null;
    const dopuRef = dopuResult?.reffId ?? "";
    const dopuPending = dopuResult && result.success ? (result as any).pending === true : false;

    if (result.success) {
      const sn = result.sn;
      createOrder({
        userId: topup.userId,
        userName: topup.userName,
        category,
        packageId,
        packageName,
        price: topup.nominal,
        quota,
        validity,
        nomorTujuan,
        sn,
        reffId: dopuRef || undefined,
        paymentMethod: "qris",
      });

      if (bot && topup.chatId) {
        try {
          if (dopuPending) {
            const circleNote = category === "circle"
              ? `\n\n📱 Buka aplikasi MyXL → konfirmasi undangan Circle yang masuk ke nomor tujuan.`
              : "";
            await bot.sendMessage(
              topup.chatId,
              `⚙️ <b>ORDER SEDANG DIPROSES</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n\n` +
              `📦 Produk: <b>${packageName}</b>\n` +
              `📱 Nomor: <code>${nomorTujuan}</code>\n` +
              `💰 Harga: <b>Rp ${topup.nominal.toLocaleString("id-ID")}</b>\n` +
              (sn ? `🔑 No. Trx: <code>${sn}</code>\n` : "") +
              `\n⏳ <i>Paket sedang diproses. Jika dalam 1×24 jam tidak masuk, hubungi admin.</i>` +
              circleNote,
              { parse_mode: "HTML" }
            );
          } else {
            const circleNote = category === "circle"
              ? `\n\nℹ️ <i>Segera buka aplikasi MyXL untuk konfirmasi undangan Circle. Undangan akan dikirim ke nomor tujuan.</i>`
              : "";
            await bot.sendMessage(
              topup.chatId,
              `✅ <b>ORDER BERHASIL!</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n\n` +
              `📦 Produk: <b>${packageName}</b>\n` +
              `📱 Nomor: <code>${nomorTujuan}</code>\n` +
              `💰 Harga: <b>Rp ${topup.nominal.toLocaleString("id-ID")}</b>\n` +
              (sn ? `🔑 SN: <code>${sn}</code>\n` : "") +
              (dopuRef ? `🔖 Ref: <code>${dopuRef}</code>\n` : "") +
              `\n<i>Pembayaran via QRIS telah dikonfirmasi.</i>` +
              circleNote,
              { parse_mode: "HTML" }
            );
          }
        } catch (err) {
          logger.error({ err }, "Failed to notify user about order success");
        }
      }

      logger.info({ order_id, sku, sn, pending: dopuPending }, "Order via QRIS completed");
    } else {
      const refunded = updateSaldo(topup.userId, topup.nominal);

      if (bot && topup.chatId) {
        try {
          await bot.sendMessage(
            topup.chatId,
            `❌ <b>ORDER GAGAL</b>\n\n` +
            `⚠️ ${result.error}` +
            (dopuRef ? `\n🔖 Ref: <code>${dopuRef}</code>` : "") +
            `\n\n💰 Rp ${topup.nominal.toLocaleString("id-ID")} telah dimasukkan ke saldo Anda.\n` +
            `Saldo sekarang: <b>Rp ${(refunded?.saldo ?? 0).toLocaleString("id-ID")}</b>`,
            { parse_mode: "HTML" }
          );
        } catch (err) {
          logger.error({ err }, "Failed to notify user about order failure");
        }
      }

      logger.warn({ order_id, sku, error: result.error }, "Order via QRIS failed — saldo refunded");
    }

    return res.json({ ok: true, message: "Order payment processed" });
  }

  const updatedUser = updateSaldo(topup.userId, topup.nominal);

  if (bot && topup.chatId) {
    try {
      await bot.sendMessage(
        topup.chatId,
        `✅ <b>TOPUP BERHASIL!</b>\n\n` +
        `• Order ID: <code>${topup.id}</code>\n` +
        `• Nominal: <b>Rp ${topup.nominal.toLocaleString("id-ID")}</b>\n` +
        (updatedUser
          ? `• Saldo sekarang: <b>Rp ${updatedUser.saldo.toLocaleString("id-ID")}</b>`
          : ""),
        { parse_mode: "HTML" }
      );
    } catch (err) {
      logger.error({ err }, "Failed to notify user via Telegram");
    }
  }

  logger.info({ order_id, userId: topup.userId }, "Topup completed via webhook");
  return res.json({ ok: true, message: "Topup processed" });
});

export default router;
