import { Router } from "express";
import { logger } from "../lib/logger";
import { getOrderByReffId, getOrderByDopuTrxId, updateOrderStatus } from "../bot/orders";
import { creditSaldoAtomic } from "../bot/users";
import { getBot } from "../bot/index";

const router = Router();

// Store last 20 raw callback payloads for debugging (exported for /api/dopu-debug)
export const recentDopuCallbacks: Array<{ ts: string; method: string; query: any; body: any }> = [];

function storeDebugPayload(method: string, query: any, body: any) {
  recentDopuCallbacks.unshift({
    ts: new Date().toISOString(),
    method,
    query,
    body,
  });
  if (recentDopuCallbacks.length > 20) recentDopuCallbacks.length = 20;
}

async function handleDopuCallback(data: Record<string, any>) {
  // Log full raw payload so we can see exactly what DOPU sends
  logger.info({ data }, "DOPU callback received — raw payload");

  // Extract refID — try every known field name DOPU might use
  const reffId = String(
    data.refID ?? data.reffid ?? data.ref_id ?? data.refid ?? data.reffId ?? data.referenceID ?? data.reference ?? ""
  ).trim();

  // DOPU's own transaction ID (#trx number)
  const dopuTrxId = String(
    data.trxID ?? data.trxid ?? data.trx_id ?? data.trx ?? data.id ?? ""
  ).trim();

  const rawStatus = String(data.status ?? "").trim();
  const message = String(data.message ?? data.pesan ?? data.keterangan ?? "").trim();
  const sn = String(data.sn ?? data.serialnumber ?? data.serial ?? "").trim();
  const msgUpper = message.toUpperCase();

  if (!reffId && !dopuTrxId) {
    logger.warn({ data }, "DOPU callback: no refID or trxID in payload — ignoring");
    return;
  }

  // Try lookup by our refID first, then fallback to DOPU's trxID
  let order = reffId ? getOrderByReffId(reffId) : undefined;
  if (!order && dopuTrxId) {
    order = getOrderByDopuTrxId(dopuTrxId);
    if (order) {
      logger.info({ dopuTrxId, orderId: order.id }, "DOPU callback: found order via trxID fallback");
    }
  }

  if (!order) {
    logger.warn({ reffId, dopuTrxId }, "DOPU callback: no matching order found");
    return;
  }

  if (order.status === "done" || order.status === "cancelled") {
    logger.info({ reffId, dopuTrxId, orderId: order.id, status: order.status }, "DOPU callback: already finalized");
    return;
  }

  const isSuccess =
    msgUpper.includes("SUKSES") ||
    msgUpper.includes("SUCCESS") ||
    msgUpper.includes("BERHASIL") ||
    (rawStatus === "1" && !msgUpper.includes("PROSES") && !msgUpper.includes("ANTRI") && !msgUpper.includes("PENDING"));

  const isFailed =
    rawStatus === "0" ||
    msgUpper.includes("GAGAL") ||
    msgUpper.includes("FAILED") ||
    msgUpper.includes("BATAL");

  const bot = getBot();
  const chatId = order.userId;

  if (isSuccess) {
    const finalSn = sn || dopuTrxId || order.sn || reffId;
    updateOrderStatus(order.id, "done", finalSn || undefined);
    logger.info({ reffId, dopuTrxId, orderId: order.id, finalSn }, "DOPU callback: order done");

    if (bot) {
      const circleNote =
        order.category === "circle"
          ? `\n\n📱 Buka aplikasi MyXL → konfirmasi undangan Circle yang masuk ke nomor tujuan.`
          : "";
      const now = new Date();
      const tgl = now.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      });
      const jam = now.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      });
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
            `Terimakasih sudah berbelanja ☺️☺️` +
            circleNote,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        logger.error({ err, chatId }, "DOPU callback: failed to notify user (success)");
      }
    }
    return;
  }

  if (isFailed) {
    updateOrderStatus(order.id, "cancelled");
    const refunded = await creditSaldoAtomic(order.userId, order.price, {
      type: "order_refund",
      refId: order.id,
      note: `Refund DOPU callback gagal: ${message.slice(0, 100)}`,
    });
    logger.info({ reffId, dopuTrxId, orderId: order.id }, "DOPU callback: order cancelled — saldo refunded");

    if (bot) {
      const errMsg = /kosong|stok|habis/i.test(message)
        ? "Stok sedang kosong. Coba produk lain atau hubungi admin."
        : /nomor|tujuan|invalid|dest/i.test(message)
        ? "Nomor tujuan tidak valid."
        : "Transaksi gagal. Hubungi admin untuk bantuan.";
      try {
        await bot.sendMessage(
          chatId,
          `❌ <b>ORDER GAGAL</b>\n\n` +
            `📦 Produk: <b>${order.packageName}</b>\n` +
            `📱 Nomor: <code>${order.nomorTujuan ?? "-"}</code>\n\n` +
            `⚠️ ${errMsg}\n` +
            `🔖 Ref: <code>${reffId || dopuTrxId}</code>\n\n` +
            `💰 Saldo <b>Rp ${order.price.toLocaleString("id-ID")}</b> telah dikembalikan.\n` +
            `Saldo sekarang: <b>Rp ${(refunded?.saldo ?? 0).toLocaleString("id-ID")}</b>`,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        logger.error({ err, chatId }, "DOPU callback: failed to notify user (failed)");
      }
    }
    return;
  }

  logger.info({ reffId, dopuTrxId, rawStatus, message }, "DOPU callback: status unclear — still pending");
}

// Support both path variants:
// /dopu/callback (legacy root)
// /webhook/dopu  (canonical — also accessible at /api/webhook/dopu via app.ts)
router.all("/dopu/callback", async (req, res) => {
  storeDebugPayload(req.method, req.query, req.body);
  res.status(200).json({ status: "ok" });
  await handleDopuCallback({ ...req.query, ...req.body });
});

router.post("/webhook/dopu", async (req, res) => {
  storeDebugPayload(req.method, req.query, req.body);
  res.status(200).json({ status: "ok" });
  await handleDopuCallback({ ...req.query, ...req.body });
});

router.get("/webhook/dopu", async (req, res) => {
  storeDebugPayload(req.method, req.query, req.body);
  res.status(200).json({ status: "ok" });
  await handleDopuCallback(req.query as Record<string, any>);
});

export default router;
