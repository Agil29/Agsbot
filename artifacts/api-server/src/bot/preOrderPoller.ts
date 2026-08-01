import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { getPendingPreOrders, updatePreOrderStatus } from "./preOrders";
import { placeKhfyOrder } from "./khfyApi";
import { creditSaldoAtomic } from "./users";

let pollerTimer: NodeJS.Timeout | null = null;
const INTERVAL_MS = 3 * 60 * 1000; // 3 menit

export function startPreOrderPoller(bot: TelegramBot): void {
  if (pollerTimer) return;
  logger.info("Pre-order poller started (interval: 3m)");

  const tick = async () => {
    const pending = getPendingPreOrders();
    if (pending.length === 0) return;
    logger.info({ count: pending.length }, "Checking pending pre-orders");

    for (const po of pending) {
      try {
        updatePreOrderStatus(po.id, "processing");
        const result = await placeKhfyOrder(po.sku, po.nomorTujuan, po.id);

        if (result.success && result.reffId) {
          updatePreOrderStatus(po.id, "done", { reffId: result.reffId, sn: result.sn });
          logger.info({ id: po.id, reffId: result.reffId }, "Pre-order processed OK");

          await bot.sendMessage(
            po.userId,
            `✅ <b>PRE ORDER BERHASIL DIPROSES!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🔖 ID : <code>${po.id}</code>\n` +
            `📦 Produk : <b>${po.packageName}</b>\n` +
            `📱 Nomor : <code>${po.nomorTujuan}</code>\n` +
            `🔖 Ref ID : <code>${result.reffId}</code>\n` +
            `${result.sn ? `🔑 SN : <code>${result.sn}</code>\n` : ""}` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Stok sudah ready dan pesanan Anda telah diproses otomatis. Terima kasih!`,
            { parse_mode: "HTML" }
          ).catch(() => {});
        } else {
          // Stok masih kosong, kembalikan ke pending
          updatePreOrderStatus(po.id, "pending");
        }
      } catch (err) {
        logger.error({ err, id: po.id }, "Pre-order poller error");
        updatePreOrderStatus(po.id, "pending");
      }
    }
  };

  tick();
  pollerTimer = setInterval(tick, INTERVAL_MS);
}

export function stopPreOrderPoller(): void {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
}
