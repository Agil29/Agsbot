import { Router } from "express";
import { logger } from "../lib/logger";
import { getOrderByReffId, updateOrderStatus } from "../bot/orders";
import { updateSaldo, getUser } from "../bot/users";
import { getBot } from "../bot/index";

const router = Router();

// DOPU callback endpoint — accepts GET and POST
// DOPU sends transaction result to this URL when processing completes
router.all("/dopu/callback", async (req, res) => {
  const data = { ...req.query, ...req.body };
  logger.info({ data }, "DOPU callback received");

  try {
    // Parse reffId and status from DOPU callback params
    const reffId = String(
      data.refID ?? data.reffid ?? data.ref_id ?? data.refid ?? data.reffId ?? ""
    );
    const status = String(data.status ?? data.keterangan ?? data.ket ?? "").toUpperCase();
    const message = String(data.message ?? data.pesan ?? "").toUpperCase();
    const sn = String(data.sn ?? data.serialnumber ?? data.serial ?? "");

    if (reffId) {
      const order = getOrderByReffId(reffId);
      if (order) {
        // Determine final outcome
        const isSuccess =
          status === "1" ||
          status.includes("SUKSES") ||
          status.includes("SUCCESS") ||
          status.includes("BERHASIL");
        const isFailed =
          status === "0" ||
          status.includes("GAGAL") ||
          status.includes("FAILED") ||
          message.includes("GAGAL") ||
          message.includes("FAILED");

        const bot = getBot();

        if (isFailed && order.status !== "cancelled" && order.status !== "done") {
          // Refund user saldo
          const refunded = updateSaldo(order.userId, order.price);
          updateOrderStatus(order.id, "cancelled");
          logger.info({ reffId, orderId: order.id }, "Order cancelled via DOPU callback — saldo refunded");

          // Notify user via Telegram
          if (bot) {
            const chatId = order.userId;
            try {
              await bot.sendMessage(
                chatId,
                `❌ <b>ORDER GAGAL</b>\n\n` +
                `📦 Produk: <b>${order.packageName}</b>\n` +
                `📱 Nomor: <code>${order.nomorTujuan ?? "-"}</code>\n\n` +
                `💰 Saldo <b>Rp ${order.price.toLocaleString("id-ID")}</b> telah dikembalikan.\n` +
                `Saldo sekarang: <b>Rp ${(refunded?.saldo ?? 0).toLocaleString("id-ID")}</b>`,
                { parse_mode: "HTML" }
              );
            } catch (err) {
              logger.error({ err, chatId }, "Failed to notify user about DOPU callback failure");
            }
          }
        } else if (isSuccess && order.status !== "done") {
          updateOrderStatus(order.id, "done", sn || undefined);
          logger.info({ reffId, orderId: order.id, sn }, "Order confirmed done via DOPU callback");

          // Optional: notify user of success confirmation
          if (bot) {
            const chatId = order.userId;
            try {
              await bot.sendMessage(
                chatId,
                `✅ <b>ORDER BERHASIL!</b>\n\n` +
                `📦 Produk: <b>${order.packageName}</b>\n` +
                `📱 Nomor: <code>${order.nomorTujuan ?? "-"}</code>\n` +
                (sn ? `🔑 SN: <code>${sn}</code>\n` : ""),
                { parse_mode: "HTML" }
              );
            } catch (err) {
              logger.error({ err, chatId }, "Failed to notify user about DOPU callback success");
            }
          }
        }
      } else {
        logger.warn({ reffId }, "DOPU callback: no matching order for reffId");
      }
    }
  } catch (err) {
    logger.error({ err }, "Error processing DOPU callback");
  }

  // Always respond 200 so DOPU doesn't retry
  res.status(200).json({ status: "ok" });
});

export default router;
