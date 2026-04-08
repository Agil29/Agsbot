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

  // Compare against total (nominal + fee) — Pakasir sends total paid amount
  const expectedAmount = topup.total ?? topup.nominal;
  const paidAmount = amount !== undefined ? Number(amount) : expectedAmount;

  // Allow ±10 tolerance for rounding differences
  if (amount !== undefined && Math.abs(paidAmount - expectedAmount) > 10) {
    logger.warn({ order_id, paidAmount, expectedAmount }, "Webhook amount mismatch — cancelling order");
    updateTopupStatus(order_id, "expired");
    const bot = getBot();
    if (bot && topup.chatId) {
      try {
        await bot.sendMessage(
          topup.chatId,
          `❌ <b>PEMBAYARAN TIDAK SESUAI</b>\n\n` +
          `Nominal yang harus dibayar: <b>Rp ${expectedAmount.toLocaleString("id-ID")}</b>\n` +
          `Nominal yang diterima: <b>Rp ${paidAmount.toLocaleString("id-ID")}</b>\n\n` +
          `⚠️ Transaksi dibatalkan karena nominal tidak sesuai.\n` +
          `Hubungi admin untuk refund.`,
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

    // Immediately notify user that payment is confirmed and order is being processed
    if (bot && topup.chatId) {
      bot.sendMessage(
        topup.chatId,
        `⏳ <b>Pembayaran diterima!</b>\n\n` +
        `📦 Paket <b>${packageName}</b> ke <code>${nomorTujuan}</code> sedang diproses...\n\n` +
        `Harap tunggu konfirmasi selesai.`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }

    // Manual packages (no SKU) — record the order and notify admin to process manually
    if (!sku || source === "manual") {
      const adminIds = (process.env.ADMIN_TELEGRAM_IDS ?? "")
        .split(",").map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n));
      createOrder({
        userId: topup.userId,
        userName: topup.userName,
        category: category as any,
        packageId,
        packageName,
        price: topup.nominal,
        baseprice: topup.nominal,
        quota,
        validity,
        nomorTujuan,
        reffId: order_id,
        paymentMethod: "qris",
      });
      if (bot) {
        for (const adminId of adminIds) {
          bot.sendMessage(
            adminId,
            `🔔 <b>ORDER MANUAL MASUK (QRIS)</b>\n\n` +
            `👤 User: <code>${topup.userId}</code>\n` +
            `📦 Paket: <b>${packageName}</b>\n` +
            `📱 Nomor: <code>${nomorTujuan}</code>\n` +
            `💰 Bayar: <b>Rp ${topup.nominal.toLocaleString("id-ID")}</b>\n` +
            `🔖 Order ID: <code>${order_id}</code>\n\n` +
            `⚠️ Proses order ini secara manual.`,
            { parse_mode: "HTML" }
          ).catch(() => {});
        }
        if (topup.chatId) {
          bot.sendMessage(
            topup.chatId,
            `✅ <b>PEMBAYARAN DITERIMA</b>\n\n` +
            `Pembayaran untuk paket <b>${packageName}</b> ke nomor <code>${nomorTujuan}</code> telah diterima.\n\n` +
            `⏳ Admin akan memproses order Anda segera. Mohon tunggu konfirmasi.\n\n` +
            `💬 Hubungi @${process.env.SUPPORT_USERNAME ?? "admin"} jika ada pertanyaan.`,
            { parse_mode: "HTML" }
          ).catch(() => {});
        }
      }
      logger.info({ order_id, packageName, nomorTujuan }, "Manual QRIS order received — notified admin");
      return res.json({ ok: true, message: "Manual order — admin notified" });
    }

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
