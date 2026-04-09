import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminPackagesRouter from "./admin/packages";
import adminSettingsRouter from "./admin/settings";
import adminBroadcastRouter from "./admin/broadcast";
import webhookRouter from "./webhook";
import dopuCallbackRouter, { recentDopuCallbacks } from "./dopuCallback";
import digiflazCallbackRouter, { recentDigiflazCallbacks } from "./digiflazCallback";
import { getAllOrders } from "../bot/orders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use("/admin", adminPackagesRouter);
router.use("/admin", adminSettingsRouter);
router.use("/admin", adminBroadcastRouter);
router.use("/webhook", webhookRouter);
router.use(dopuCallbackRouter);
router.use(digiflazCallbackRouter);

// Debug: see last 20 raw DOPU callback payloads
router.get("/dopu-debug", (_req, res) => {
  res.json({ count: recentDopuCallbacks.length, callbacks: recentDopuCallbacks });
});

// Debug: see last 20 raw Digiflaz callback payloads
router.get("/digiflaz-debug", (_req, res) => {
  res.json({ count: recentDigiflazCallbacks.length, callbacks: recentDigiflazCallbacks });
});

// Debug: see all orders currently in "processing" state (pending provider completion)
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
