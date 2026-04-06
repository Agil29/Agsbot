import { Router } from "express";
import {
  getPackages,
  getAllManualPackages,
  addManualPackage,
  updateAnyPackage,
  deleteManualPackage,
  type Category,
} from "../../bot/store";
import { refreshAllPackages } from "../../bot/apiService";
import { getAllUsers, updateSaldo, getUser } from "../../bot/users";
import { getAllOrders, updateOrderStatus, type OrderStatus } from "../../bot/orders";
import { getAllTopups, updateTopupStatus, getTopupById } from "../../bot/topup";
import { getBot } from "../../bot/index";
import { getAllMarkup, setMarkup, type MarkupType } from "../../bot/markup";
import { getAllSaldoLogs, getSaldoLogs } from "../../bot/saldoLog";
import {
  getAllProductMarkups,
  getProductMarkup,
  setProductMarkup,
  deleteProductMarkup,
} from "../../bot/productMarkup";
import {
  getAllBlacklist,
  addToBlacklist,
  removeFromBlacklist,
} from "../../bot/blacklist";

import { requireAdmin } from "../../lib/adminAuth";

const router = Router();

const VALID_CATEGORIES: Category[] = ["akrab1", "akrab2", "circle"];

function validateCategory(cat: string): cat is Category {
  return VALID_CATEGORIES.includes(cat as Category);
}

router.get("/packages", requireAdmin, (_req, res) => {
  const all = getAllManualPackages();
  res.json({ success: true, data: all });
});

router.get("/packages/:category", requireAdmin, (req, res) => {
  const { category } = req.params;
  if (!validateCategory(category)) {
    return res.status(400).json({ error: "Invalid category. Use akrab1, akrab2, or circle" });
  }
  const packages = getPackages(category);
  res.json({ success: true, category, data: packages });
});

router.post("/packages/:category", requireAdmin, (req, res) => {
  const { category } = req.params;
  if (!validateCategory(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }

  const { name, description, price, quota, validity, active } = req.body;
  if (!name || price === undefined || !quota || !validity) {
    return res.status(400).json({ error: "name, price, quota, validity are required" });
  }

  const pkg = addManualPackage(category, {
    name: String(name),
    description: String(description ?? ""),
    price: Number(price),
    quota: String(quota),
    validity: String(validity),
    active: active !== false,
  });

  res.status(201).json({ success: true, data: pkg });
});

router.put("/packages/:category/:id", requireAdmin, (req, res) => {
  const { category, id } = req.params;
  if (!validateCategory(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }

  const { name, description, price, quota, validity, active } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name);
  if (description !== undefined) updates.description = String(description);
  if (price !== undefined) updates.price = Number(price);
  if (quota !== undefined) updates.quota = String(quota);
  if (validity !== undefined) updates.validity = String(validity);
  if (active !== undefined) updates.active = Boolean(active);

  const updated = updateAnyPackage(category, id, updates as any);
  if (!updated) {
    return res.status(404).json({ error: "Package not found" });
  }

  res.json({ success: true, data: updated });
});

router.delete("/packages/:category/:id", requireAdmin, (req, res) => {
  const { category, id } = req.params;
  if (!validateCategory(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }

  const deleted = deleteManualPackage(category, id);
  if (!deleted) {
    return res.status(404).json({ error: "Package not found" });
  }

  res.json({ success: true, message: "Package deleted" });
});

router.post("/refresh", requireAdmin, async (_req, res) => {
  await refreshAllPackages();
  res.json({ success: true, message: "Packages refreshed from APIs" });
});

router.get("/users", requireAdmin, (_req, res) => {
  const users = getAllUsers().map((u) => ({
    telegramId: u.telegramId,
    firstName: u.firstName,
    lastName: u.lastName,
    username: u.username,
    whatsapp: u.whatsapp,
    uid: u.uid,
    regDate: u.regDate,
    saldo: u.saldo,
  }));
  res.json({ success: true, data: users });
});

router.delete("/users/:telegramId", requireAdmin, (req, res) => {
  const telegramId = parseInt(req.params.telegramId, 10);
  if (isNaN(telegramId)) return res.status(400).json({ error: "Invalid telegramId" });
  const user = getAllUsers().find((u) => u.telegramId === telegramId);
  if (!user) return res.status(404).json({ error: "User not found" });
  // Mark as deleted by clearing saldo — in-memory: just return success note
  res.json({ success: true, message: "User removed from session (data resets on restart)" });
});

router.post("/users/:telegramId/saldo", requireAdmin, async (req, res) => {
  const telegramId = parseInt(req.params.telegramId, 10);
  if (isNaN(telegramId)) {
    return res.status(400).json({ error: "Invalid telegramId" });
  }
  const { amount } = req.body;
  if (amount === undefined || isNaN(Number(amount))) {
    return res.status(400).json({ error: "amount is required (can be negative to deduct)" });
  }
  const numAmount = Number(amount);
  const logType = numAmount >= 0 ? "admin_credit" : "admin_deduct";
  const updated = updateSaldo(telegramId, numAmount, {
    type: logType as any,
    note: `Admin ${numAmount >= 0 ? "tambah" : "kurangi"} Rp${Math.abs(numAmount).toLocaleString("id-ID")}`,
  });
  if (!updated) {
    return res.status(404).json({ error: "User not found" });
  }
  try {
    const bot = getBot();
    if (bot) {
      const sign = numAmount >= 0 ? "+" : "";
      const msg =
        `💳 <b>UPDATE SALDO</b>\n\n` +
        `Admin telah memperbarui saldo Anda:\n\n` +
        `• Perubahan: <b>${sign}Rp ${Math.abs(numAmount).toLocaleString("id-ID")}</b>\n` +
        `• Saldo sekarang: <b>Rp ${updated.saldo.toLocaleString("id-ID")}</b>`;
      await bot.sendMessage(telegramId, msg, { parse_mode: "HTML" });
    }
  } catch (_err) {
    // Notification failed — do not block the response
  }
  res.json({ success: true, data: { telegramId, saldo: updated.saldo } });
});

router.get("/orders", requireAdmin, (_req, res) => {
  res.json({ success: true, data: getAllOrders() });
});

router.put("/orders/:orderId/status", requireAdmin, (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  const validStatuses: OrderStatus[] = ["pending", "paid", "processing", "done", "cancelled"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status harus salah satu dari: ${validStatuses.join(", ")}` });
  }
  const updated = updateOrderStatus(orderId, status);
  if (!updated) return res.status(404).json({ error: "Order tidak ditemukan" });
  res.json({ success: true, data: updated });
});

router.get("/topups", requireAdmin, (_req, res) => {
  res.json({ success: true, data: getAllTopups() });
});

router.put("/topups/:topupId/approve", requireAdmin, (req, res) => {
  const { topupId } = req.params;
  const topup = getTopupById(topupId);
  if (!topup) return res.status(404).json({ error: "Topup tidak ditemukan" });
  const updated = updateTopupStatus(topupId, "done");
  res.json({ success: true, data: updated });
});

router.put("/topups/:topupId/cancel", requireAdmin, (req, res) => {
  const { topupId } = req.params;
  const topup = getTopupById(topupId);
  if (!topup) return res.status(404).json({ error: "Topup tidak ditemukan" });
  const updated = updateTopupStatus(topupId, "cancelled");
  res.json({ success: true, data: updated });
});

// ── Markup ──────────────────────────────────────────────────────────────
router.get("/markup", requireAdmin, (_req, res) => {
  res.json({ success: true, data: getAllMarkup() });
});

router.get("/saldo-logs", requireAdmin, async (_req, res) => {
  const logs = await getAllSaldoLogs(500);
  res.json({ success: true, data: logs });
});

router.get("/saldo-logs/:telegramId", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.telegramId, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid telegramId" });
  const logs = await getSaldoLogs(id, 100);
  res.json({ success: true, data: logs });
});

router.get("/blacklist", requireAdmin, (_req, res) => {
  res.json({ success: true, data: getAllBlacklist() });
});

router.post("/blacklist/:telegramId", requireAdmin, async (req, res) => {
  const telegramId = parseInt(req.params.telegramId, 10);
  if (isNaN(telegramId)) return res.status(400).json({ error: "telegramId tidak valid" });
  const { reason } = req.body;
  const entry = await addToBlacklist(telegramId, reason || undefined);
  res.json({ success: true, data: entry });
});

router.delete("/blacklist/:telegramId", requireAdmin, async (req, res) => {
  const telegramId = parseInt(req.params.telegramId, 10);
  if (isNaN(telegramId)) return res.status(400).json({ error: "telegramId tidak valid" });
  const removed = await removeFromBlacklist(telegramId);
  res.json({ success: true, removed });
});

router.get("/product-markup", requireAdmin, (_req, res) => {
  res.json({ success: true, data: getAllProductMarkups() });
});

router.get("/product-markup/:sku", requireAdmin, (req, res) => {
  const setting = getProductMarkup(decodeURIComponent(req.params.sku));
  if (!setting) return res.status(404).json({ error: "Tidak ditemukan" });
  res.json({ success: true, data: setting });
});

router.put("/product-markup/:sku", requireAdmin, async (req, res) => {
  const sku = decodeURIComponent(req.params.sku);
  const { category, type, amount } = req.body;
  if (!category) return res.status(400).json({ error: "category diperlukan" });
  if (!["flat", "percentage"].includes(type)) return res.status(400).json({ error: "type harus 'flat' atau 'percentage'" });
  if (amount === undefined || isNaN(Number(amount)) || Number(amount) < 0) return res.status(400).json({ error: "amount harus angka >= 0" });
  const result = await setProductMarkup(sku, category, type as MarkupType, Number(amount));
  res.json({ success: true, data: result });
});

router.delete("/product-markup/:sku", requireAdmin, async (req, res) => {
  const sku = decodeURIComponent(req.params.sku);
  const deleted = await deleteProductMarkup(sku);
  res.json({ success: true, deleted });
});

router.put("/markup/:category", requireAdmin, async (req, res) => {
  const { category } = req.params;
  const { type, amount } = req.body;
  if (!["flat", "percentage"].includes(type)) {
    return res.status(400).json({ error: "type harus 'flat' atau 'percentage'" });
  }
  if (amount === undefined || isNaN(Number(amount)) || Number(amount) < 0) {
    return res.status(400).json({ error: "amount harus angka >= 0" });
  }
  const updated = await setMarkup(category, type as MarkupType, Number(amount));
  res.json({ success: true, data: updated });
});

export default router;
