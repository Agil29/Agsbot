import { Router } from "express";
import {
  getPackages,
  getAllManualPackages,
  addManualPackage,
  updateManualPackage,
  deleteManualPackage,
  type Category,
} from "../../bot/store";
import { refreshAllPackages } from "../../bot/apiService";
import { getAllUsers, updateSaldo } from "../../bot/users";

const router = Router();

const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "admin123";

function requireAdmin(req: any, res: any, next: any) {
  const key = req.headers["x-admin-key"] ?? req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

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

  const updated = updateManualPackage(category, id, updates as any);
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
    uid: u.uid,
    regDate: u.regDate,
    saldo: u.saldo,
  }));
  res.json({ success: true, data: users });
});

router.post("/users/:telegramId/saldo", requireAdmin, (req, res) => {
  const telegramId = parseInt(req.params.telegramId, 10);
  if (isNaN(telegramId)) {
    return res.status(400).json({ error: "Invalid telegramId" });
  }
  const { amount } = req.body;
  if (amount === undefined || isNaN(Number(amount))) {
    return res.status(400).json({ error: "amount is required (can be negative to deduct)" });
  }
  const updated = updateSaldo(telegramId, Number(amount));
  if (!updated) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({ success: true, data: { telegramId, saldo: updated.saldo } });
});

export default router;
