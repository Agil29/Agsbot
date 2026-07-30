import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { getPendingPreOrders, updatePreOrderStatus } from "./preOrders";
import { placeKhfyOrder } from "./khfyApi";
import { creditSaldoAtomic } from "./users";

let pollingInterval: NodeJS.Timeout | null = null;
const POLL_INTERVAL_MS = 3 * 60 * 1000; // Check every 3 minutes

export function startPreOrderPolling(bot: TelegramBot) {
  if (pollingInterval) {
    logger.warn("Pre-order polling already started");
    return;
  }

  logger.info("Starting pre-order polling...");

  const pollFn = async () => {
    try {
      const pendingOrders = getPendingPreOrders();
      if (pendingOrders.length === 0) return;

      logger.info({ count: pendingOrders.length }, "Checking pending pre-orders");

      for (const po of pendingOrders) {
        try {
          // Update status to processing before attempting
          updatePreOrderStatus(po.id, "processing");

          logger.info(
            { preOrderId: po.id, sku: po.sku, nomor: po.nomorTujuan },
            "Attempting to process pre-order via KHFY"
          );

          const result = await placeKhfyOrder(po.sku, po.nomorTujuan, po.id);

          if (result.success && result.reffId) {
            // Order berhasil
            updatePreOrderStatus(po.id, "done", {
              reffId: result.reffId,
              sn: result.sn,
            });

            logger.info(
              { preOrderId: po.id, reffId: result.reffId },
              "Pre-order successfully processed"
            );

            // Notify user
            await bot.sendMessage(
              po.userId,
              `✅ <b>PRE ORDER BERHASIL DIPROSES!</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n\n` +
              `🔖 Pre Order ID : <code>${po.id}</code>\n` +
              `📦 Produk : <b>${po.packageName}</b>\n` +
              `📱 Nomor : <code>${po.nomorTujuan}</code>\n` +
              `🔖 Ref ID : <code>${result.reffId}</code>\n` +
              `${result.sn ? `🔑 SN : <code>${result.sn}</code>\n` : ""}\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `⏳ Pre order Anda telah diproses otomatis karena stok sudah ready.\n` +
              `Terima kasih!`,
              { parse_mode: "HTML" }
            ).catch((err) =>
              logger.error({ err, userId: po.userId }, "Failed to notify user about successful pre-order")
            );
          } else {
            // Order gagal — kembalikan ke pending dan refund tidak dilakukan
            updatePreOrderStatus(po.id, "pending");
            logger.info(
              { preOrderId: po.id, reason: result.message || result.raw },
              "Pre-order failed (stok masih kosong), kembali ke pending"
            );
          }
        } catch (err) {
          logger.error({ err, preOrderId: po.id }, "Error processing pre-order");
          // Kembalikan ke pending agar dicoba lagi di polling berikutnya
          updatePreOrderStatus(po.id, "pending");
        }
      }
    } catch (err) {
      logger.error({ err }, "Pre-order polling error");
    }
  };

  // Run immediately on start, then repeat
  pollFn();
  pollingInterval = setInterval(pollFn, POLL_INTERVAL_MS);
}

export function stopPreOrderPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    logger.info("Pre-order polling stopped");
  }
}
