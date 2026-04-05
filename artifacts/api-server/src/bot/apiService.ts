import axios from "axios";
import { logger } from "../lib/logger";
import { type PackageItem, type Category, setApiPackages } from "./store";

const API1_BASE_URL = process.env.API1_BASE_URL || "";
const API1_KEY = process.env.API1_KEY || "";

const API2_BASE_URL = process.env.API2_BASE_URL || "";
const API2_KEY = process.env.API2_KEY || "";

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

function formatApi2Package(raw: Record<string, unknown>): PackageItem {
  return {
    id: `api2_${raw.id ?? raw.code ?? Math.random()}`,
    name: String(raw.name ?? raw.nama ?? ""),
    description: String(raw.description ?? raw.deskripsi ?? ""),
    price: Number(raw.price ?? raw.harga ?? 0),
    quota: String(raw.quota ?? raw.kuota ?? ""),
    validity: String(raw.validity ?? raw.masa_aktif ?? ""),
    active: Boolean(raw.active ?? raw.aktif ?? true),
    source: "api2",
  };
}

export async function fetchAkrab1Packages(): Promise<PackageItem[]> {
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
  if (!API2_BASE_URL) {
    logger.info("API2_BASE_URL not configured, using empty package list for akrab2");
    return [];
  }
  try {
    const res = await axios.get(`${API2_BASE_URL}/packages`, {
      headers: { Authorization: `Bearer ${API2_KEY}` },
      timeout: 10000,
    });
    const data = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    return data.map((r: Record<string, unknown>) => formatApi2Package(r));
  } catch (err) {
    logger.error({ err }, "Failed to fetch akrab2 packages from API2");
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
