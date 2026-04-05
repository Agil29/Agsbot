import axios from "axios";
import { logger } from "../lib/logger";
import { type PackageItem, type Category, setApiPackages } from "./store";

const AKRAB2_ALLOWED_SKUS = ["XLA14", "XLA32", "XLA39", "XLA51", "XLA65", "XLA89"];

function formatApi1Package(raw: Record<string, unknown>, source: "api1"): PackageItem {
  return {
    id: `api1_${raw.id ?? raw.code ?? Math.random()}`,
    name: String(raw.name ?? raw.nama ?? ""),
    description: String(raw.description ?? raw.deskripsi ?? ""),
    price: Number(raw.price ?? raw.harga ?? 0),
    quota: String(raw.quota ?? raw.kuota ?? ""),
    validity: String(raw.validity ?? raw.masa_aktif ?? ""),
    active: Boolean(raw.active ?? raw.aktif ?? true),
    source,
  };
}

function formatKhfyPackage(raw: Record<string, unknown>): PackageItem {
  const sku = String(raw.kode ?? raw.produk ?? raw.code ?? raw.sku ?? "");
  const stock = Number(raw.stok ?? raw.stock ?? raw.qty ?? 0);
  const price = Number(raw.harga ?? raw.price ?? 0);
  const name = String(raw.nama ?? raw.name ?? sku);
  const desc = String(raw.keterangan ?? raw.deskripsi ?? raw.description ?? "");
  return {
    id: `api2_${sku}`,
    name,
    description: desc,
    price,
    quota: String(raw.kuota ?? raw.quota ?? ""),
    validity: String(raw.masa_aktif ?? raw.validity ?? ""),
    active: stock > 0,
    source: "api2",
    sku,
    stock,
  };
}

export async function fetchAkrab1Packages(): Promise<PackageItem[]> {
  const API1_BASE_URL = process.env.API1_BASE_URL || "";
  const API1_KEY = process.env.API1_KEY || "";
  if (!API1_BASE_URL) {
    logger.info("API1_BASE_URL not configured, using empty package list for akrab1");
    return [];
  }
  try {
    const res = await axios.get(`${API1_BASE_URL}/packages/akrab1`, {
      headers: { Authorization: `Bearer ${API1_KEY}` },
      timeout: 10000,
    });
    const data = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    return data.map((r: Record<string, unknown>) => formatApi1Package(r, "api1"));
  } catch (err) {
    logger.error({ err }, "Failed to fetch akrab1 packages from API1");
    return [];
  }
}

export async function fetchCirclePackages(): Promise<PackageItem[]> {
  const API1_BASE_URL = process.env.API1_BASE_URL || "";
  const API1_KEY = process.env.API1_KEY || "";
  if (!API1_BASE_URL) {
    logger.info("API1_BASE_URL not configured, using empty package list for circle");
    return [];
  }
  try {
    const res = await axios.get(`${API1_BASE_URL}/packages/circle`, {
      headers: { Authorization: `Bearer ${API1_KEY}` },
      timeout: 10000,
    });
    const data = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    return data.map((r: Record<string, unknown>) => formatApi1Package(r, "api1"));
  } catch (err) {
    logger.error({ err }, "Failed to fetch circle packages from API1");
    return [];
  }
}

export async function fetchAkrab2Packages(): Promise<PackageItem[]> {
  const API2_BASE_URL = process.env.API2_BASE_URL || "";
  const API2_KEY = process.env.API2_KEY || "";
  if (!API2_BASE_URL || !API2_KEY) {
    logger.info("API2_BASE_URL/API2_KEY not configured, using empty package list for akrab2");
    return [];
  }
  try {
    const url = `${API2_BASE_URL}/list_product?api_key=${API2_KEY}`;
    const res = await axios.get(url, { timeout: 10000 });
    const raw: Record<string, unknown>[] = Array.isArray(res.data)
      ? res.data
      : (Array.isArray(res.data?.data) ? res.data.data : []);

    const filtered = raw.filter((r) => {
      const kode = String(r.kode ?? r.produk ?? r.code ?? r.sku ?? "").toUpperCase();
      return AKRAB2_ALLOWED_SKUS.includes(kode);
    });

    const packages = filtered.map(formatKhfyPackage);
    logger.info({ count: packages.length, skus: packages.map((p) => p.sku) }, "Fetched AKRAB 2 packages from KHFY");
    return packages;
  } catch (err) {
    logger.error({ err }, "Failed to fetch akrab2 packages from KHFY API");
    return [];
  }
}

export async function refreshAllPackages() {
  logger.info("Refreshing all packages from APIs...");
  const [akrab1, circle, akrab2] = await Promise.all([
    fetchAkrab1Packages(),
    fetchCirclePackages(),
    fetchAkrab2Packages(),
  ]);
  setApiPackages("akrab1", akrab1);
  setApiPackages("circle", circle);
  setApiPackages("akrab2", akrab2);
  logger.info(
    { akrab1Count: akrab1.length, circleCount: circle.length, akrab2Count: akrab2.length },
    "Packages refreshed"
  );
}

export function startPackageRefreshScheduler(intervalMs = 5 * 60 * 1000) {
  refreshAllPackages();
  setInterval(refreshAllPackages, intervalMs);
}
