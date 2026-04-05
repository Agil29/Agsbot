import { Router } from "express";
import { logger } from "../lib/logger";
import { getTopupById, updateTopupStatus } from "../bot/topup";
import { updateSaldo } from "../bot/users";
import { createOrder } from "../bot/orders";
import { placeKhfyOrder } from "../bot/khfyApi";
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

    logger.info({ order_id, sku, nomorTujuan }, "Processing order payment via QRIS webhook");

    const result = await placeKhfyOrder({ sku, tujuan: nomorTujuan });

    if (result.success) {
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
        sn: result.sn,
        paymentMethod: "qris",
      });

      if (bot && topup.chatId) {
        try {
          await bot.sendMessage(
            topup.chatId,
            `✅ <b>ORDER BERHASIL!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📦 Produk: <b>${packageName}</b>\n` +
            `📱 Nomor: <code>${nomorTujuan}</code>\n` +
            `💰 Harga: <b>Rp ${topup.nominal.toLocaleString("id-ID")}</b>\n` +
            (result.sn ? `🔑 SN: <code>${result.sn}</code>\n` : "") +
            `\n<i>Pembayaran via QRIS telah dikonfirmasi.</i>`,
            { parse_mode: "HTML" }
          );
        } catch (err) {
          logger.error({ err }, "Failed to notify user about order success");
        }
      }

      logger.info({ order_id, sku, sn: result.sn }, "Order via QRIS completed");
    } else {
      const refunded = updateSaldo(topup.userId, topup.nominal);

      if (bot && topup.chatId) {
        try {
          await bot.sendMessage(
            topup.chatId,
            `❌ <b>ORDER GAGAL</b>\n\n` +
            `${result.error}\n\n` +
            `💰 Rp ${topup.nominal.toLocaleString("id-ID")} telah direfund ke saldo Anda.\n` +
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
