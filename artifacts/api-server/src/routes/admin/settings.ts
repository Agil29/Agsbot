import { Router } from "express";
import { logger } from "../../lib/logger";
import { getAllUsers } from "../../bot/users";
import { getAllOrders } from "../../bot/orders";
import { getAllTopups } from "../../bot/topup";
import { getDopuBalance } from "../../bot/dopuApi";
import { getKhfyBalance } from "../../bot/khfyApi";

import { requireAdmin } from "../../lib/adminAuth";

const router = Router();

const runtimeConfig: Record<string, string> = {
  DOPU_BASE_URL: process.env.DOPU_BASE_URL ?? "",
  DOPU_MEMBER_ID: process.env.DOPU_MEMBER_ID ?? "",
  DOPU_PIN: process.env.DOPU_PIN ?? "",
  DOPU_PASSWORD: process.env.DOPU_PASSWORD ?? "",
  API2_BASE_URL: process.env.API2_BASE_URL ?? "",
  API2_KEY: process.env.API2_KEY ?? "",
  SUPPORT_USERNAME: process.env.SUPPORT_USERNAME ?? "Agsstore_29",
  PAKASIR_SLUG: process.env.PAKASIR_SLUG ?? "",
  PAKASIR_API_KEY: process.env.PAKASIR_API_KEY ?? "",
  PAKASIR_WEBHOOK_SECRET: process.env.PAKASIR_WEBHOOK_SECRET ?? "",
};

export function getRuntimeConfig() {
  return { ...runtimeConfig };
}

router.get("/settings", requireAdmin, (_req, res) => {
  const safe = { ...runtimeConfig };
  if (safe.DOPU_PIN) safe.DOPU_PIN = "***";
  if (safe.DOPU_PASSWORD) safe.DOPU_PASSWORD = "***";
  if (safe.API2_KEY) safe.API2_KEY = "***";
  if (safe.PAKASIR_API_KEY) safe.PAKASIR_API_KEY = "***";
  // PAKASIR_WEBHOOK_SECRET is shown to admin so the full webhook URL can be displayed
  res.json({ success: true, data: safe });
});

router.put("/settings", requireAdmin, (req, res) => {
  const allowed = [
    "DOPU_BASE_URL", "DOPU_MEMBER_ID", "DOPU_PIN", "DOPU_PASSWORD",
    "API2_BASE_URL", "API2_KEY",
    "SUPPORT_USERNAME", "PAKASIR_SLUG", "PAKASIR_API_KEY", "PAKASIR_WEBHOOK_SECRET",
  ];
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
  const completedTopups = topups.filter((t: any) => t.status === "completed" || t.status === "done");
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

router.get("/analytics", requireAdmin, async (_req, res) => {
  const orders = getAllOrders();
  const topups = getAllTopups();
  const users = getAllUsers();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const start12Months = new Date(now.getFullYear() - 1, now.getMonth(), 1);

  const successOrders = orders.filter((o: any) => o.status === "done");
  const monthOrders = successOrders.filter((o: any) => new Date(o.createdAt) >= startOfMonth);
  const penghasilan = monthOrders.reduce((s: number, o: any) => {
    const profit = o.price - (o.baseprice ?? o.price);
    return s + profit;
  }, 0);
  const penghasilan12m = successOrders
    .filter((o: any) => new Date(o.createdAt) >= start12Months)
    .reduce((s: number, o: any) => s + (o.price - (o.baseprice ?? o.price)), 0);
  const produkTerjual = monthOrders.length;

  const successTopups = topups.filter((t: any) => t.status === "completed" || t.status === "done");
  const depositMember = users.reduce((s: number, u: any) => s + (u.saldo ?? 0), 0);
  const monthDeposit = successTopups
    .filter((t: any) => new Date(t.createdAt) >= startOfMonth)
    .reduce((s: number, t: any) => s + t.nominal, 0);

  // 12-month summary
  const orders12m = orders.filter((o: any) => new Date(o.createdAt) >= start12Months);
  const totalSpent12m = orders12m.filter((o: any) => o.status === "done").reduce((s: number, o: any) => s + o.price, 0);

  // Fetch API balances
  const [dopuBalResult, khfyBalResult] = await Promise.all([
    getDopuBalance().catch(() => null),
    getKhfyBalance().catch(() => null),
  ]);
  const dopuBal = dopuBalResult?.balance ?? null;
  const khfyBal = khfyBalResult?.balance ?? null;

  // Build daily user registration for last 30 days
  const days: { date: string; users: number; orders: number; topups: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayStart = new Date(dateStr);
    const dayEnd = new Date(dateStr);
    dayEnd.setDate(dayEnd.getDate() + 1);

    days.push({
      date: dateStr,
      users: users.filter((u: any) => new Date(u.regDate) >= dayStart && new Date(u.regDate) < dayEnd).length,
      orders: orders.filter((o: any) => new Date(o.createdAt) >= dayStart && new Date(o.createdAt) < dayEnd).length,
      topups: topups.filter((t: any) => new Date(t.createdAt) >= dayStart && new Date(t.createdAt) < dayEnd).length,
    });
  }

  const dopuUrl = runtimeConfig.DOPU_BASE_URL;
  const api2Url = runtimeConfig.API2_BASE_URL;

  res.json({
    success: true,
    data: {
      depositMember,
      monthDeposit,
      penghasilan,
      penghasilan12m,
      produkTerjual,
      produkTerjual12m: orders12m.filter((o: any) => o.status === "done").length,
      totalSpent12m,
      totalOrders: successOrders.length,
      api1Configured: !!dopuUrl,
      api2Configured: !!api2Url,
      api1Label: dopuUrl ? (() => { try { return new URL(dopuUrl).hostname; } catch { return dopuUrl; } })() : "Belum dikonfigurasi",
      api2Label: api2Url ? (() => { try { return new URL(api2Url).hostname; } catch { return api2Url; } })() : "Belum dikonfigurasi",
      dopuBalance: dopuBal,
      khfyBalance: khfyBal,
      dailyChart: days,
    },
  });
});

export default router;
