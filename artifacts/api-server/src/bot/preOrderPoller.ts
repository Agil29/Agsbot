import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { getPendingPreOrders, updatePreOrderStatus } from "./preOrders";
import { placeKhfyOrder, checkKhfyOrderStatus } from "./khfyApi";
import { createOrder } from "./orders";
import { getUser } from "./users";

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

        const result = await placeKhfyOrder({ sku: po.sku, tujuan: po.nomorTujuan, reffId: po.id });

        if (!result.success) {
          // KHFY return error — stok kosong atau gagal, kembalikan ke pending
          logger.info({ id: po.id, error: result.error }, "Pre-order: KHFY gagal, tetap pending");
          updatePreOrderStatus(po.id, "pending");
          continue;
        }

        // KHFY return success — verifikasi via /history
        const trxid = (result as any).trxid ?? "";

        if (!trxid) {
          logger.info({ id: po.id }, "Pre-order: tidak ada trxid, tetap pending");
          updatePreOrderStatus(po.id, "pending");
          continue;
        }

        // Tunggu sebentar lalu cek status via /history
        await new Promise(r => setTimeout(r, 5000));
        const statusResult = await checkKhfyOrderStatus(trxid);

        if (statusResult.status === "success") {
          // Benar-benar berhasil — update pre-order
          updatePreOrderStatus(po.id, "done", { reffId: result.reffId, sn: statusResult.sn });
          logger.info({ id: po.id, trxid, sn: statusResult.sn }, "Pre-order processed OK");

          // ── Buat entry di tabel orders supaya muncul di History Penjualan ──
          try {
            const user = getUser(po.userId);
            const orderEntry = createOrder({
              userId: po.userId,
              userName: po.userName,
              userUsername: user?.username ?? undefined,
              category: "preorder",
              packageId: po.sku,
              packageName: po.packageName,
              price: po.price,
              baseprice: po.price,
              quota: "",
              validity: "",
              nomorTujuan: po.nomorTujuan,
              sn: statusResult.sn || undefined,
              reffId: result.reffId,
              paymentMethod: po.paymentMethod as "saldo" | "qris",
              provider: "khfy",
            });
            // Mark langsung sebagai done
            const { updateOrderStatus } = await import("./orders");
            updateOrderStatus(orderEntry.id, "done", statusResult.sn || undefined);
            logger.info({ orderId: orderEntry.id, preOrderId: po.id }, "Pre-order entry added to orders");
          } catch (err) {
            logger.error({ err, preOrderId: po.id }, "Failed to create order entry for pre-order");
          }

          // Notif user
          await bot.sendMessage(
            po.userId,
            `✅ <b>PRE ORDER BERHASIL DIPROSES!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🔖 ID : <code>${po.id}</code>\n` +
            `📦 Produk : <b>${po.packageName}</b>\n` +
            `📱 Nomor : <code>${po.nomorTujuan}</code>\n` +
            `🔖 Ref ID : <code>${result.reffId}</code>\n` +
            `${statusResult.sn ? `🔑 SN : <code>${statusResult.sn}</code>\n` : ""}` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Pesanan Anda telah diproses otomatis. Terima kasih!`,
            { parse_mode: "HTML" }
          ).catch(() => {});

        } else if (statusResult.status === "failed") {
          logger.info({ id: po.id, trxid }, "Pre-order: KHFY gagal di history, tetap pending");
          updatePreOrderStatus(po.id, "pending");

        } else {
          logger.info({ id: po.id, trxid, status: statusResult.status }, "Pre-order: status pending di history");
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
