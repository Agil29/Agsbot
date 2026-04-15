import { Router } from "express";
import { logger } from "../lib/logger";
import { getOrderByReffId, updateOrderStatus, getAllOrders } from "../bot/orders";
import { creditSaldoAtomic } from "../bot/users";
import { getBot } from "../bot/index";

const router = Router();

export const recentDigiflazCallbacks: Array<{ ts: string; body: any }> = [];

function storeDebugPayload(body: any) {
  recentDigiflazCallbacks.unshift({ ts: new Date().toISOString(), body });
  if (recentDigiflazCallbacks.length > 20) recentDigiflazCallbacks.length = 20;
}

async function handleDigiflazCallback(body: Record<string, any>) {
  logger.info({ body }, "Digiflaz callback received — raw payload");

  const data = body?.data ?? body;

  const refId = String(
    data.ref_id ?? data.refId ?? data.ref ?? ""
  ).trim();

  const rawStatus = String(data.status ?? data.message ?? "").trim();
  const statusLower = rawStatus.toLowerCase();
  const sn = String(data.sn ?? data.serial_number ?? data.serialnumber ?? "").trim();
  const message = String(data.message ?? "").trim();

  if (!refId) {
    logger.warn({ body }, "Digiflaz callback: no ref_id in payload — ignoring");
    return;
  }

  const order = getOrderByReffId(refId);
  if (!order) {
    logger.warn({ refId }, "Digiflaz callback: no matching order found");
    return;
  }

  if (order.status === "done" || order.status === "cancelled") {
    logger.info({ refId, orderId: order.id, status: order.status }, "Digiflaz callback: already finalized");
    return;
  }

  const isSuccess =
    statusLower === "sukses" ||
    statusLower === "success" ||
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
    logger.info({ refId, orderId: order.id, sn }, "Digiflaz callback: order done");

    if (bot) {
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
            `Terimakasih sudah berbelanja ☺️☺️`,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        logger.error({ err, chatId }, "Digiflaz callback: failed to notify user (success)");
      }
    }
    return;
  }

  if (isFailed) {
    updateOrderStatus(order.id, "cancelled");
    const refunded = await creditSaldoAtomic(order.userId, order.price, {
      type: "order_refund",
      refId: order.id,
      note: `Refund Digiflaz callback gagal: ${message.slice(0, 100)}`,
    });
    logger.info({ refId, orderId: order.id }, "Digiflaz callback: order cancelled — saldo refunded");

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
        logger.error({ err, chatId }, "Digiflaz callback: failed to notify user (failed)");
      }
    }
    return;
  }

  logger.info({ refId, rawStatus, message }, "Digiflaz callback: status unclear — still pending");
}

router.post("/webhook/digiflaz", async (req, res) => {
  storeDebugPayload(req.body);
  res.status(200).json({ status: "ok" });
  await handleDigiflazCallback(req.body ?? {});
});

router.get("/webhook/digiflaz", async (req, res) => {
  storeDebugPayload(req.query);
  res.status(200).json({ status: "ok" });
  await handleDigiflazCallback(req.query as Record<string, any>);
});

router.get("/digiflaz-debug", (_req, res) => {
  res.json({ count: recentDigiflazCallbacks.length, callbacks: recentDigiflazCallbacks });
});

router.get("/orders-debug", (_req, res) => {
  const all = getAllOrders();
  const processing = all.filter((o) => o.status === "processing" || o.status === "pending");
  const recent = all.slice(0, 20);
  res.json({
    processing_count: processing.length,
    processing: processing.map((o) => ({
      id: o.id,
      status: o.status,
      reffId: o.reffId,
      packageName: o.packageName,
      nomorTujuan: o.nomorTujuan,
      paymentMethod: o.paymentMethod,
      createdAt: o.createdAt,
    })),
    recent_20: recent.map((o) => ({
      id: o.id,
      status: o.status,
      reffId: o.reffId,
      packageName: o.packageName,
      paymentMethod: o.paymentMethod,
      createdAt: o.createdAt,
    })),
  });
});

export default router;
