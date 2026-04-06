import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { getAllTopups, updateTopupStatus, cancelPakasirTransaction } from "./topup";

const CHECK_INTERVAL_MS = 30 * 1000; // setiap 30 detik
let expiryTimer: ReturnType<typeof setInterval> | null = null;

async function checkExpiredTopups(bot: TelegramBot) {
  const now = new Date();
  const pending = getAllTopups().filter(
    (t) => t.status === "pending" && t.expiresAt <= now
  );

  for (const topup of pending) {
    try {
      updateTopupStatus(topup.id, "expired");

      // Coba batalkan transaksi di Pakasir (best effort, tidak blokir jika gagal)
      cancelPakasirTransaction(topup.id).catch(() => {});

      logger.info(
        { topupId: topup.id, userId: topup.userId },
        "Topup expired — notifying user"
      );

      const isOrderPayment = !!topup.orderPayload;
      const message = isOrderPayment
        ? `⏰ <b>TRANSAKSI KADALUARSA</b>\n\n` +
          `Pembayaran untuk paket <b>${topup.orderPayload!.packageName}</b> ke nomor <code>${topup.orderPayload!.nomorTujuan}</code> ` +
          `tidak dikonfirmasi dalam waktu 7 menit.\n\n` +
          `Jika sudah membayar, hubungi admin agar diverifikasi manual.`
        : `⏰ <b>TOPUP KADALUARSA</b>\n\n` +
          `Topup <b>Rp ${topup.nominal.toLocaleString("id-ID")}</b> tidak dibayar dalam 7 menit.\n\n` +
          `Silakan buat topup baru melalui menu 💰 TOPUP.`;

      await bot.sendMessage(topup.chatId, message, { parse_mode: "HTML" });
    } catch (err) {
      logger.error({ err, topupId: topup.id }, "Error saat proses expiry topup");
    }
  }
}

export function startTopupExpiryChecker(bot: TelegramBot) {
  if (expiryTimer) return;
  expiryTimer = setInterval(() => {
    checkExpiredTopups(bot).catch((err) =>
      logger.error({ err }, "Topup expiry check crashed")
    );
  }, CHECK_INTERVAL_MS);
  logger.info("Topup expiry checker started (interval: 30s)");
}

export function stopTopupExpiryChecker() {
  if (expiryTimer) {
    clearInterval(expiryTimer);
    expiryTimer = null;
  }
}
