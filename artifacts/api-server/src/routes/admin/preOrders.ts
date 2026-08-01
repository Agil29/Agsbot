import { Router } from "express";
import { requireAdmin } from "../../lib/adminAuth";
import { getAllPreOrders, getPreOrderById, updatePreOrderStatus } from "../../bot/preOrders";
import { creditSaldoAtomic } from "../../bot/users";
import { getBot } from "../../bot/index";
import { logger } from "../../lib/logger";

const router = Router();

// GET /admin/pre-orders
router.get("/pre-orders", requireAdmin, (_req, res) => {
  const orders = getAllPreOrders();
  res.json({ data: orders });
});

// POST /admin/pre-orders/:id/cancel
router.post("/pre-orders/:id/cancel", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body ?? {};

  const po = getPreOrderById(id);
  if (!po) {
    res.status(404).json({ error: "Pre order tidak ditemukan" });
    return;
  }
  if (po.status === "done" || po.status === "cancelled" || po.status === "refunded") {
    res.status(400).json({ error: `Tidak bisa cancel, status saat ini: ${po.status}` });
    return;
  }

  // Refund saldo jika bayar via saldo
  let refundedSaldo = 0;
  if (po.paymentMethod === "saldo" && po.price > 0) {
    try {
      await creditSaldoAtomic(po.userId, po.price, {
        type: "pre_order_refund",
        refId: po.id,
        note: `Refund pre-order dibatalkan admin: ${po.id}`,
      });
      refundedSaldo = po.price;
    } catch (err) {
      logger.error({ err, id: po.id }, "Failed to refund pre-order saldo");
    }
  }

  updatePreOrderStatus(id, "cancelled", { note: note ?? "Dibatalkan admin" });

  // Notify user via bot
  const bot = getBot();
  if (bot) {
    const msg =
      `❌ <b>PRE ORDER DIBATALKAN</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🔖 ID : <code>${po.id}</code>\n` +
      `📦 Produk : <b>${po.packageName}</b>\n` +
      `📱 Nomor : <code>${po.nomorTujuan}</code>\n` +
      (refundedSaldo > 0
        ? `💰 Saldo <b>Rp ${refundedSaldo.toLocaleString("id-ID")}</b> telah dikembalikan.\n`
        : "") +
      (note ? `📝 Alasan : ${note}\n` : "") +
      `━━━━━━━━━━━━━━━━━━━━`;
    bot.sendMessage(po.userId, msg, { parse_mode: "HTML" }).catch(() => {});
  }

  res.json({ success: true, refundedSaldo });
});

// POST /admin/pre-orders/:id/refund  (untuk kasus nomor salah setelah done)
router.post("/pre-orders/:id/refund", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body ?? {};

  const po = getPreOrderById(id);
  if (!po) {
    res.status(404).json({ error: "Pre order tidak ditemukan" });
    return;
  }
  if (po.status !== "done") {
    res.status(400).json({ error: "Refund hanya bisa dilakukan untuk pre-order yang sudah done" });
    return;
  }

  let refundedSaldo = 0;
  if (po.paymentMethod === "saldo" && po.price > 0) {
    try {
      await creditSaldoAtomic(po.userId, po.price, {
        type: "pre_order_refund",
        refId: po.id,
        note: `Refund manual pre-order: ${po.id}`,
      });
      refundedSaldo = po.price;
    } catch (err) {
      logger.error({ err, id: po.id }, "Failed to refund pre-order saldo");
    }
  }

  updatePreOrderStatus(id, "refunded", { note: note ?? "Refund manual admin" });

  const bot = getBot();
  if (bot) {
    const msg =
      `💰 <b>REFUND PRE ORDER</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🔖 ID : <code>${po.id}</code>\n` +
      `📦 Produk : <b>${po.packageName}</b>\n` +
      `📱 Nomor : <code>${po.nomorTujuan}</code>\n` +
      (refundedSaldo > 0
        ? `💰 Saldo <b>Rp ${refundedSaldo.toLocaleString("id-ID")}</b> telah dikembalikan.\n`
        : "") +
      (note ? `📝 Alasan : ${note}\n` : "") +
      `━━━━━━━━━━━━━━━━━━━━`;
    bot.sendMessage(po.userId, msg, { parse_mode: "HTML" }).catch(() => {});
  }

  res.json({ success: true, refundedSaldo });
});

export default router;
