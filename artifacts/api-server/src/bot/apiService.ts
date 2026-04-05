import axios from "axios";
import { logger } from "../lib/logger";
import { type PackageItem, type Category, setApiPackages } from "./store";

const AKRAB2_ALLOWED_SKUS = ["XLA14", "XLA32", "XLA39", "XLA51", "XLA65", "XLA89"];

const AKRAB1_SKUS = [
  "XDA13","XDA19","XDA25","XDA31","XDA34","XDA38",
  "XDA47","XDA55","XDA63","XDA64","XDA76","XDA88",
];
const CIRCLE_SKUS = [
  "XCLP5","XCLP10","XCLP15","XCLP20","XCLP25","XCLP30",
  "XCLP35","XCLP40","XCLP45","XCLP50","XCLP55","XCLP60",
  "XCLP65","XCLP70","XCLP75","XCLP80","XCLP85","XCLP90",
  "XCLP95","XCLP100","XCLP105","XCLP110","XCLP115","XCLP120",
];

// Quota info from juraganxl.my.id (Area 1 / Area 2 / Area 3 / Area 4)
const XDA_QUOTA: Record<string, { name: string; desc: string }> = {
  XDA13:  { name: "UTAMA 13GB",  desc: "Area 1: 13GB | Area 2: 15GB | Area 3: 20GB | Area 4: 30GB" },
  XDA19:  { name: "UTAMA 19GB",  desc: "Area 1: 19GB | Area 2: 21GB | Area 3: 26GB | Area 4: 36GB" },
  XDA25:  { name: "UTAMA 25GB",  desc: "Area 1: 25GB | Area 2: 27GB | Area 3: 32GB | Area 4: 42GB" },
  XDA31:  { name: "UTAMA 31GB",  desc: "Area 1: 31GB | Area 2: 33GB | Area 3: 38GB | Area 4: 48GB" },
  XDA34:  { name: "UTAMA 34GB",  desc: "Area 1: 33GB | Area 2: 36GB | Area 3: 47GB | Area 4: 71GB" },
  XDA38:  { name: "UTAMA 38GB",  desc: "Area 1: 38GB | Area 2: 40GB | Area 3: 45GB | Area 4: 55GB" },
  XDA47:  { name: "UTAMA 47GB",  desc: "Area 1: 47GB | Area 2: 49GB | Area 3: 54GB | Area 4: 64GB" },
  XDA55:  { name: "UTAMA 55GB",  desc: "Area 1: 55GB | Area 2: 57GB | Area 3: 61GB | Area 4: 71GB" },
  XDA63:  { name: "UTAMA 63GB",  desc: "Area 1: 63GB | Area 2: 65GB | Area 3: 70GB | Area 4: 80GB" },
  XDA64:  { name: "UTAMA 64GB",  desc: "Area 1: 65GB | Area 2: 70GB | Area 3: 83GB | Area 4: 123GB" },
  XDA76:  { name: "UTAMA 76GB",  desc: "Area 1: 76GB | Area 2: 78GB | Area 3: 83GB | Area 4: 93GB" },
  XDA88:  { name: "UTAMA 88GB",  desc: "Area 1: 88GB | Area 2: 90GB | Area 3: 95GB | Area 4: 105GB" },
};

// XCLP quota range (min GB - max GB)
function xclpRange(sku: string): string {
  const n = parseInt(sku.replace("XCLP", ""), 10);
  return `${n} GB - ${n + 4} GB`;
}

type StockMap = Record<string, number>;

async function scrapeJuraganXlStock(): Promise<StockMap> {
  try {
    const res = await axios.get("https://juraganxl.my.id/", { timeout: 15000 });
    const html: string = res.data;
    // Strip HTML tags
    const text = html.replace(/<[^>]+>/g, "\n").replace(/&nbsp;/g, " ").replace(/\r/g, "");
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    const stockMap: StockMap = {};
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match XDA13, XCLP5, etc.
      const skuMatch = line.match(/^(XDA\d+|XCLP\d+)$/);
      if (skuMatch) {
        const sku = skuMatch[1];
        // Look for stock in next few lines
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const stockMatch = lines[j].match(/[Ss]tock\s*:?\s*(\d+)/);
          if (stockMatch) {
            stockMap[sku] = parseInt(stockMatch[1], 10);
            break;
          }
        }
        if (stockMap[sku] === undefined) stockMap[sku] = 0;
      }
    }
    logger.info({ count: Object.keys(stockMap).length }, "Scraped stock from juraganxl.my.id");
    return stockMap;
  } catch (err) {
    logger.error({ err }, "Failed to scrape juraganxl.my.id");
    return {};
  }
}

export async function fetchAkrab1Packages(): Promise<PackageItem[]> {
  const stockMap = await scrapeJuraganXlStock();
  return AKRAB1_SKUS.map((sku): PackageItem => {
    const meta = XDA_QUOTA[sku] ?? { name: sku, desc: "" };
    const stock = stockMap[sku] ?? 0;
    return {
      id: `dopu_${sku}`,
      name: meta.name,
      description: meta.desc,
      price: 0,
      quota: meta.desc,
      validity: "30 Hari",
      active: true,
      source: "dopu",
      sku,
      stock,
    };
  });
}

export async function fetchCirclePackages(): Promise<PackageItem[]> {
  const stockMap = await scrapeJuraganXlStock();
  return CIRCLE_SKUS.map((sku): PackageItem => {
    const n = parseInt(sku.replace("XCLP", ""), 10);
    const range = xclpRange(sku);
    const stock = stockMap[sku] ?? 0;
    return {
      id: `dopu_${sku}`,
      name: `CIRCLE ${n}GB`,
      description: `Kuota: ${range}`,
      price: 0,
      quota: range,
      validity: "30 Hari",
      active: true,
      source: "dopu",
      sku,
      stock,
    };
  });
}

function formatKhfyPackage(raw: Record<string, unknown>): PackageItem {
  const sku = String(raw.kode_produk ?? raw.kode ?? raw.produk ?? raw.code ?? raw.sku ?? "");
  const name = String(raw.nama_produk ?? raw.nama ?? raw.name ?? sku);
  const price = Number(raw.harga_final ?? raw.harga ?? raw.price ?? 0);
  const desc = String(raw.deskripsi ?? raw.keterangan ?? raw.description ?? "");
  const kosong = Number(raw.kosong ?? 0);
  const gangguan = Number(raw.gangguan ?? 0);
  const tersedia = kosong === 0 && gangguan === 0;
  return {
    id: `api2_${sku}`,
    name,
    description: desc,
    price,
    quota: "",
    validity: "",
    active: true,
    source: "api2",
    sku,
    stock: tersedia ? 1 : 0,
  };
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
      const kode = String(r.kode_produk ?? r.kode ?? r.produk ?? r.code ?? r.sku ?? "").toUpperCase();
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
