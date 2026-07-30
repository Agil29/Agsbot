import { Router, type IRouter } from "express";
import axios from "axios";
import { fetchAkrabStock } from "../bot/apiService";
import healthRouter from "./health";
import authRouter from "./auth";
import adminPackagesRouter from "./admin/packages";
import adminSettingsRouter from "./admin/settings";
import adminBroadcastRouter from "./admin/broadcast";
import adminPreOrdersRouter from "./admin/preOrders";
import webhookRouter from "./webhook";
import dopuCallbackRouter, { recentDopuCallbacks } from "./dopuCallback";
import digiflazCallbackRouter from "./digiflazCallback";
import khfyCallbackRouter, { recentKhfyCallbacks } from "./khfyCallback";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use("/admin", adminPackagesRouter);
router.use("/admin", adminSettingsRouter);
router.use("/admin", adminBroadcastRouter);
router.use("/admin", adminPreOrdersRouter);
router.use("/webhook", webhookRouter);
router.use(dopuCallbackRouter);
router.use(digiflazCallbackRouter);
router.use(khfyCallbackRouter);

// Debug: see last 20 raw DOPU callback payloads
router.get("/dopu-debug", (_req, res) => {
  res.json({ count: recentDopuCallbacks.length, callbacks: recentDopuCallbacks });
});

// Debug: fetch raw KHFY product list and show parsed availability
router.get("/khfy-debug", async (_req, res) => {
  const baseUrl = process.env.API2_BASE_URL ?? "";
  const apiKey = process.env.API2_KEY ?? "";
  if (!baseUrl || !apiKey) {
    res.json({ error: "API2_BASE_URL or API2_KEY not configured" });
    return;
  }
  try {
    const url = `${baseUrl}/list_product?api_key=${apiKey}`;
    const response = await axios.get(url, { timeout: 10000 });
    const raw: Record<string, unknown>[] = Array.isArray(response.data)
      ? response.data
      : (Array.isArray(response.data?.data) ? response.data.data : []);

    const ALLOWED = [
      "XLA14", "XLA32", "XLA39", "XLA48", "XLA55", "XLA65", "XLA77", "XLA89",
    ];
    const matched = raw.filter((r) => {
      const kode = String(r.kode_produk ?? r.kode ?? r.produk ?? r.code ?? r.sku ?? "").toUpperCase();
      return ALLOWED.includes(kode);
    });

    // Stok riil berasal dari endpoint terpisah (cek_stock_akrab), bukan list_product
    const stockMap = await fetchAkrabStock();

    res.json({
      total_from_api: raw.length,
      matched_count: matched.length,
      // Show ALL fields of each matched product so we can see stock/status fields
      matched_raw: matched,
      // Also show keys present in the first product (any product)
      first_product_keys: raw[0] ? Object.keys(raw[0]) : [],
      stock_source: stockMap === null ? "unavailable" : "cek_stock_akrab",
      stock_slots: stockMap === null ? null : Object.fromEntries(stockMap),
    });
  } catch (err: any) {
    res.json({ error: err?.message ?? "Unknown error", response: err?.response?.data });
  }
});

export default router;
