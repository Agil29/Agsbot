import { Router } from "express";
import { requireAdmin } from "../../lib/adminAuth";
import {
  getAllPreOrders,
  getPreOrderById,
  updatePreOrderStatus,
} from "../../bot/preOrders";
import { creditSaldoAtomic } from "../../bot/users";
import { getBot } from "../../bot/index";
import { logger } from "../../lib/logger";

const router = Router();

// GET /admin/pre-orders
router.get("/pre-orders", requireAdmin, (_req, res) => {
  const orders = getAllPreOrders();
  res.json({ data: orders });
});

// PUT /admin/pre-orders/:id/cancel  — admin cancel + refund saldo
router.put("/pre-orders/:id/cancel", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body ?? {};

  const po = getPreOrderById(id);
  if (!po) {
    res.status(404).json({ error: "Pre order tidak ditemukan" });
    return;
  }

  if (po.status === "done" || po.status === "cancelled") {
    res.status(400).json({ error: `Pre order sudah ${po.status}` });
    return;
  }

  // Refund saldo (saldo payment method)
  let refundedSaldo = 0;
  if (po.paymentMethod === "saldo") {
    try {
      const updated = await creditSaldoAtomic(po.userId, po.price, {
        type: "order_refund",
        refId: po.id,
        note: `Refund pre order cancel admin: ${note ?? ""}`,
      });
      refundedSaldo = updated?.saldo ?? 0;
    } catch (err) {
      logger.error({ err, preOrderId: id }, "Failed to refund pre order saldo");
    }
  }

  updatePreOrderStatus(id, "cancelled", { note: note ?? "Dibatalkan admin" });

  // Notif user via bot
  const bot = getBot();
  if (bot) {
    const refundLine = po.paymentMethod === "saldo"
      ? `\n💰 Saldo <b>Rp ${po.price.toLocaleString("id-ID")}</b> telah dikembalikan.\nSaldo sekarang: <b>Rp ${refundedSaldo.toLocaleString("id-ID")}</b>`
      : `\n💰 Pembayaran via QRIS — hubungi admin untuk refund manual.`;

    bot.sendMessage(
      po.userId,
      `❌ <b>PRE ORDER DIBATALKAN</b>\n\n` +
      `🔖 Pre Order ID: <code>${po.id}</code>\n` +
      `📦 Produk: <b>${po.packageName}</b>\n` +
      `📱 Nomor: <code>${po.nomorTujuan}</code>\n` +
      (note ? `📋 Alasan: ${note}\n` : "") +
      refundLine,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }

  res.json({ success: true, refundedSaldo, note: note ?? "Dibatalkan admin" });
});

export default router;
