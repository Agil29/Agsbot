import { Router } from "express";
import { logger } from "../lib/logger";
import { getTopupById, updateTopupStatus } from "../bot/topup";
import { creditSaldoAtomic } from "../bot/users";
import { createOrder } from "../bot/orders";
import { placeKhfyOrder } from "../bot/khfyApi";
import { placeDopuOrder, type DopuOrderResult } from "../bot/dopuApi";
import { placeDigiflazOrder, type DigiflazOrderResult } from "../bot/digiflazApi";
import { getBot } from "../bot";

const router = Router();

const PAKASIR_SECRET = process.env.PAKASIR_WEBHOOK_SECRET ?? "";

router.post("/pakasir", async (req, res) => {
  // Verify webhook secret if configured
  if (PAKASIR_SECRET) {
    const token = (req.query.secret as string) ?? req.headers["x-webhook-secret"] ?? "";
    if (token !== PAKASIR_SECRET) {
      logger.warn({ ip: req.ip }, "Pakasir webhook: invalid secret");
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }
  }

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

  const isPaid = /paid|completed|settlement|success|sukses|lunas|berhasil|^1$/i.test(status);
  if (!isPaid) {
    logger.info({ order_id, status }, "Pakasir webhook — ignoring non-paid status");
    return res.json({ ok: true, message: "Ignored non-paid status" });
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
  const paidAmount = amount !== undefined ? Number(amount) : expectedAmount;

  if (amount !== undefined && paidAmount !== expectedAmount) {
    const isUnder = paidAmount < expectedAmount;
    logger.warn({ order_id, paidAmount, expectedAmount, type: isUnder ? "underpaid" : "overpaid" }, "Webhook amount mismatch — cancelling order");
    updateTopupStatus(order_id, "expired");
    const bot = getBot();
    if (bot && topup.chatId) {
      try {
        await bot.sendMessage(
          topup.chatId,
          `❌ <b>PEMBAYARAN TIDAK SESUAI</b>\n\n` +
          `Nominal yang harus dibayar: <b>Rp ${expectedAmount.toLocaleString("id-ID")}</b>\n` +
          `Nominal yang diterima: <b>Rp ${paidAmount.toLocaleString("id-ID")}</b>\n\n` +
          `⚠️ Transaksi dibatalkan karena nominal tidak sesuai.\n\n` +
          `Silakan order ulang dan scan ulang QRIS dengan nominal yang benar.\n` +
          `Untuk refund uang yang sudah ditransfer, hubungi admin.`,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        logger.error({ err }, "Failed to notify user about amount mismatch");
      }
    }
    return res.json({ ok: true, message: "Amount mismatch — order cancelled" });
  }

  updateTopupStatus(order_id, "completed");
  const bot = getBot();

  if (topup.orderPayload) {
    const { sku, nomorTujuan, packageName, category, packageId, quota, validity, source } = topup.orderPayload;

    logger.info({ order_id, sku, nomorTujuan, category, source }, "Processing order payment via QRIS webhook");

    const useDigiflaz = source === "digiflaz";
    const useDopu = !useDigiflaz && (category === "akrab1" || category === "circle");
    // Generate a stable refId for traceability (especially for Digiflaz/DOPU)
    const { randomUUID } = await import("crypto");
    const webhookRefId = randomUUID().replace(/-/g, "").slice(0, 20);
    const result = useDigiflaz
      ? await placeDigiflazOrder({ sku, tujuan: nomorTujuan, refId: webhookRefId })
      : useDopu
        ? await placeDopuOrder({ sku, tujuan: nomorTujuan, reffId: webhookRefId })
        : await placeKhfyOrder({ sku, tujuan: nomorTujuan });

    // Extract provider-specific fields safely
    const dopuResult = useDopu ? (result as DopuOrderResult) : null;
    const digiflazResult = useDigiflaz ? (result as DigiflazOrderResult) : null;
    const dopuRef = dopuResult?.reffId ?? digiflazResult?.refId ?? webhookRefId;
    const dopuPending = (dopuResult && result.success ? (result as any).pending === true : false)
      || (digiflazResult && result.success ? (result as any).pending === true : false);

    if (result.success) {
      const sn = result.sn;
      const newOrder = createOrder({
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
          const _now = new Date();
          const _tgl = _now.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
          const _jam = _now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
          if (dopuPending) {
            const circleNote = category === "circle" && !useDigiflaz
              ? `\n\n📱 Buka aplikasi MyXL → konfirmasi undangan Circle yang masuk ke nomor tujuan.`
              : "";
            await bot.sendMessage(
              topup.chatId,
              `⚙️ <b>ORDER SEDANG DIPROSES</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n\n` +
              `🔖 Order ID  : <code>${newOrder.id}</code>\n` +
              `📦 Produk: <b>${packageName}</b>\n` +
              `📱 Nomor: <code>${nomorTujuan}</code>\n` +
              `💰 Harga: <b>Rp ${topup.nominal.toLocaleString("id-ID")}</b>\n` +
              (sn ? `🔑 No. Trx: <code>${sn}</code>\n` : "") +
              `\n⏳ <i>Paket sedang diproses. Jika dalam 30 menit tidak masuk, hubungi admin.</i>` +
              circleNote,
              { parse_mode: "HTML" }
            );
          } else {
            const circleNote = category === "circle" && !useDigiflaz
              ? `\n\nℹ️ <i>Segera buka aplikasi MyXL untuk konfirmasi undangan Circle. Undangan akan dikirim ke nomor tujuan.</i>`
              : "";
            await bot.sendMessage(
              topup.chatId,
              `✅ <b>ORDER BERHASIL !</b>\n` +
              `━━━━━━━━━━━━━━━━━━━\n` +
              `🔖 Order ID  : <code>${newOrder.id}</code>\n` +
              `📦 Produk : <b>${packageName}</b>\n` +
              `📱 Target : <code>${nomorTujuan}</code>\n` +
              `💰 Harga : <b>Rp ${topup.nominal.toLocaleString("id-ID")}</b>\n` +
              `📅 Date  : ${_tgl}\n\n` +
              `Jam Sukses : ${_jam} WIB\n\n` +
              `Terimakasih sudah berbelanja ☺️☺️` +
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
      const refunded = await creditSaldoAtomic(topup.userId, topup.nominal, {
        type: "order_refund",
        refId: order_id,
        note: `Refund order QRIS gagal: ${result.error ?? ""}`,
      });

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

  const updatedUser = await creditSaldoAtomic(topup.userId, topup.nominal, {
    type: "topup",
    refId: order_id,
    note: `QRIS topup Rp${topup.nominal.toLocaleString("id-ID")} via webhook Pakasir`,
  });

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
