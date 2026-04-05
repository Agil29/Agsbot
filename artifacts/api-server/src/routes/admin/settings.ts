import { Router } from "express";
import { logger } from "../../lib/logger";
import { getAllUsers } from "../../bot/users";
import { getAllOrders } from "../../bot/orders";
import { getAllTopups } from "../../bot/topup";

const router = Router();

const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "admin123";

function requireAdmin(req: any, res: any, next: any) {
  const key = req.headers["x-admin-key"] ?? req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

const runtimeConfig: Record<string, string> = {
  API1_BASE_URL: process.env.API1_BASE_URL ?? "",
  API1_KEY: process.env.API1_KEY ?? "",
  API2_BASE_URL: process.env.API2_BASE_URL ?? "",
  API2_KEY: process.env.API2_KEY ?? "",
  SUPPORT_USERNAME: process.env.SUPPORT_USERNAME ?? "Agsstore_29",
  PAKASIR_SLUG: process.env.PAKASIR_SLUG ?? "",
};

export function getRuntimeConfig() {
  return { ...runtimeConfig };
}

router.get("/settings", requireAdmin, (_req, res) => {
  const safe = { ...runtimeConfig };
  if (safe.API1_KEY) safe.API1_KEY = "***";
  if (safe.API2_KEY) safe.API2_KEY = "***";
  res.json({ success: true, data: safe });
});

router.put("/settings", requireAdmin, (req, res) => {
  const allowed = ["API1_BASE_URL", "API1_KEY", "API2_BASE_URL", "API2_KEY", "SUPPORT_USERNAME", "PAKASIR_SLUG"];
  const updated: Record<string, string> = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined && req.body[key] !== "***") {
      runtimeConfig[key] = String(req.body[key]);
      process.env[key] = String(req.body[key]);
      updated[key] = key.includes("KEY") ? "***" : String(req.body[key]);
    }
  }

  logger.info({ updated }, "Bot settings updated by admin");
  res.json({ success: true, data: updated, message: "Pengaturan diperbarui" });
});

router.get("/stats", requireAdmin, (_req, res) => {
  const users = getAllUsers();
  const orders = getAllOrders();
  const topups = getAllTopups();

  const totalSaldo = users.reduce((sum: number, u: any) => sum + u.saldo, 0);
  const completedTopups = topups.filter((t: any) => t.status === "completed");
  const totalDeposit = completedTopups.reduce((sum: number, t: any) => sum + t.nominal, 0);
  const pendingOrders = orders.filter((o: any) => o.status === "pending").length;
  const doneOrders = orders.filter((o: any) => o.status === "done").length;

  res.json({
    success: true,
    data: {
      totalUsers: users.length,
      totalSaldo,
      totalOrders: orders.length,
      pendingOrders,
      doneOrders,
      totalTopups: topups.length,
      totalDeposit,
    },
  });
});

export default router;
