import { Router } from "express";
import { logger } from "../lib/logger";
import { getOrderByReffId, updateOrderStatus } from "../bot/orders";
import { creditSaldoAtomic } from "../bot/users";
import { getBot } from "../bot/index";

const router = Router();

export const recentKhfyCallbacks: Array<{ ts: string; body: any }> = [];

async function handleKhfyCallback(body: Record<string, any>) {
  logger.info({ body }, "KHFY callback received — raw payload");

  recentKhfyCallbacks.unshift({ ts: new Date().toISOString(), body });
  if (recentKhfyCallbacks.length > 20) recentKhfyCallbacks.length = 20;

  const refId = String(
    body.reff_id ?? body.refid ?? body.ref_id ?? body.reffId ?? body.trx_id ?? ""
  ).trim();

  const rawStatus = String(body.status ?? body.message ?? body.msg ?? "").trim();
  const statusLower = rawStatus.toLowerCase();
  const sn = String(body.sn ?? body.serial ?? body.no_seri ?? "").trim();
  const message = String(body.message ?? body.msg ?? body.pesan ?? "").trim();

  if (!refId) {
    logger.warn({ body }, "KHFY callback: no reff_id — ignoring");
    return;
  }

  const order = getOrderByReffId(refId);
  if (!order) {
    logger.warn({ refId }, "KHFY callback: no matching order found");
    return;
  }

  if (order.status === "done" || order.status === "cancelled") {
    logger.info({ refId, orderId: order.id, status: order.status }, "KHFY callback: already finalized");
    return;
  }

  const isSuccess =
    statusLower === "sukses" ||
    statusLower === "success" ||
    statusLower === "berhasil" ||
    message.toUpperCase().includes("SUKSES") ||
    message.toUpperCase().includes("SUCCESS");

  const isFailed =
    statusLower === "gagal" ||
    statusLower === "failed" ||
    statusLower === "failure" ||
    message.toUpperCase().includes("GAGAL") ||
    message.toUpperCase().includes("FAILED");

  const bot = getBot();
  const chatId = order.userId;

  if (isSuccess) {
    updateOrderStatus(order.id, "done", sn || undefined);
    logger.info({ refId, orderId: order.id, sn }, "KHFY callback: order done");

    if (bot) {
      const now = new Date();
      const tgl = now.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
      const jam = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
      try {
        await bot.sendMessage(
          chatId,
          `✅ <b>ORDER BERHASIL !</b>\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `🔖 Order ID  : <code>${order.id}</code>\n` +
            `📦 Produk : <b>${order.packageName}</b>\n` +
            `📱 Target : <code>${order.nomorTujuan ?? "-"}</code>\n` +
            `💰 Harga : <b>Rp ${order.price.toLocaleString("id-ID")}</b>\n` +
            `📅 Date  : ${tgl}\n\n` +
            `Jam Sukses : ${jam} WIB\n\n` +
            `Terimakasih sudah berbelanja ☺️☺️`,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        logger.error({ err, chatId }, "KHFY callback: failed to notify user (success)");
      }
    }
    return;
  }

  if (isFailed) {
    updateOrderStatus(order.id, "cancelled");
    const refunded = await creditSaldoAtomic(order.userId, order.price, {
      type: "order_refund",
      refId: order.id,
      note: `Refund KHFY callback gagal: ${message.slice(0, 100)}`,
    });
    logger.info({ refId, orderId: order.id }, "KHFY callback: order cancelled — saldo refunded");

    if (bot) {
      const errMsg = message.length > 0 ? message.slice(0, 120) : "Transaksi gagal. Hubungi admin.";
      try {
        await bot.sendMessage(
          chatId,
          `❌ <b>ORDER GAGAL</b>\n\n` +
            `📦 Produk: <b>${order.packageName}</b>\n` +
            `📱 Nomor: <code>${order.nomorTujuan ?? "-"}</code>\n\n` +
            `⚠️ ${errMsg}\n` +
            `🔖 Ref: <code>${refId}</code>\n\n` +
            `💰 Saldo <b>Rp ${order.price.toLocaleString("id-ID")}</b> telah dikembalikan.\n` +
            `Saldo sekarang: <b>Rp ${(refunded?.saldo ?? 0).toLocaleString("id-ID")}</b>`,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        logger.error({ err, chatId }, "KHFY callback: failed to notify user (failed)");
      }
    }
    return;
  }

  logger.info({ refId, rawStatus, message }, "KHFY callback: status unclear — still pending");
}

router.post("/webhook/khfy", async (req, res) => {
  res.status(200).json({ status: "ok" });
  await handleKhfyCallback(req.body ?? {});
});

router.get("/webhook/khfy", async (_req, res) => {
  res.status(200).json({ status: "ok", message: "KHFY webhook endpoint active" });
});

export default router;
