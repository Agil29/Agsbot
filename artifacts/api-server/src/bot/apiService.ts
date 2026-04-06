import axios from "axios";
import { logger } from "../lib/logger";
import { type PackageItem, type Category, setApiPackages } from "./store";
import { getDigiflazPrice } from "./digiflazApi";

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

// Area quota values per SKU (Area1 / Area2 / Area3 / Area4 in GB)
const XDA_AREAS: Record<string, [number, number, number, number]> = {
  XDA13:  [13,  15,  20,  30],
  XDA19:  [19,  21,  26,  36],
  XDA25:  [25,  27,  32,  42],
  XDA31:  [31,  33,  38,  48],
  XDA34:  [33,  36,  47,  71],
  XDA38:  [38,  40,  45,  55],
  XDA47:  [47,  49,  54,  64],
  XDA55:  [55,  57,  61,  71],
  XDA63:  [63,  65,  70,  80],
  XDA64:  [65,  70,  83, 123],
  XDA76:  [76,  78,  83,  93],
  XDA88:  [88,  90,  95, 105],
};

const AKRAB1_NOTES =
  `\n\nnoted :\n` +
  `~ Pastikan tidak ada paket akrab di no tujuan\n` +
  `~ rewards tidak masuk, tunggu 1 x 24 jam, baru komplen\n` +
  `~ official, resmi, bergaransi`;

const CIRCLE_NOTES =
  `\n\nnote:\n` +
  `- Tidak menambah masa aktif\n` +
  `- Cuma bisa order 1x dalam 1 bln\n` +
  `- Tidak sedang tergabung dalam paket circle\n` +
  `- Umur kartu minimal 60hr`;

function xclpRange(sku: string): string {
  const n = parseInt(sku.replace("XCLP", ""), 10);
  return `${n} GB - ${n + 4} GB`;
}

export async function fetchAkrab1Packages(): Promise<PackageItem[]> {
  return AKRAB1_SKUS.map((sku): PackageItem => {
    const areas = XDA_AREAS[sku] ?? [0, 0, 0, 0];
    const areaText =
      `Area 1 : ${areas[0]}GB\n` +
      `Area 2 : ${areas[1]}GB\n` +
      `Area 3 : ${areas[2]}GB\n` +
      `Area 4 : ${areas[3]}GB`;
    const description = areaText + AKRAB1_NOTES;
    return {
      id: `dopu_${sku}`,
      name: sku,
      description,
      price: 0,
      quota: areaText,
      validity: "27 - 30 Hari",
      active: true,
      source: "dopu",
      sku,
      stock: 0,
    };
  });
}

export async function fetchCirclePackages(): Promise<PackageItem[]> {
  return CIRCLE_SKUS.map((sku): PackageItem => {
    const range = xclpRange(sku);
    const n = parseInt(sku.replace("XCLP", ""), 10);
    const description = `Kuota : ${range}` + CIRCLE_NOTES;
    return {
      id: `dopu_${sku}`,
      name: sku,
      description,
      price: 0,
      quota: range,
      validity: "27 - 30 Hari",
      active: true,
      source: "dopu",
      sku,
      stock: 0,
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

const DIGIFLAZ_CIRCLE_SKUS: Array<{ sku: string; name: string; description: string; quota: string; validity: string }> = [
  {
    sku: "Mal30",
    name: "Mall XL 30GB",
    description: "Kuota Mall 30GB\n\nnote:\n- Tidak menambah masa aktif\n- Cuma bisa order 1x dalam 1 bln\n- Tidak sedang tergabung dalam paket circle\n- Umur kartu minimal 60hr",
    quota: "30 GB",
    validity: "30 Hari",
  },
];

async function fetchDigiflazCirclePackages(): Promise<PackageItem[]> {
  const username = process.env.DIGIFLAZ_USERNAME ?? "";
  const apiKey = process.env.DIGIFLAZ_API_KEY ?? "";
  if (!username || !apiKey) return [];

  const results: PackageItem[] = [];
  for (const item of DIGIFLAZ_CIRCLE_SKUS) {
    const price = await getDigiflazPrice(item.sku);
    results.push({
      id: `digiflaz_${item.sku}`,
      name: item.name,
      description: item.description,
      price,
      quota: item.quota,
      validity: item.validity,
      active: true,
      source: "digiflaz",
      sku: item.sku,
    });
  }
  logger.info({ count: results.length }, "Fetched Digiflaz circle packages");
  return results;
}

export async function refreshAllPackages() {
  logger.info("Refreshing all packages from APIs...");
  const [akrab1, circleDopu, akrab2, circleDigiflaz] = await Promise.all([
    fetchAkrab1Packages(),
    fetchCirclePackages(),
    fetchAkrab2Packages(),
    fetchDigiflazCirclePackages(),
  ]);
  const circle = [...circleDopu, ...circleDigiflaz];
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
