import axios from "axios";
import { logger } from "../lib/logger";
import { type PackageItem, type Category, setApiPackages } from "./store";
import { getDigiflazPrice } from "./digiflazApi";
import { fetchAkrabXdaStock, type AkrabStockItem } from "./akrabApi";

// Diselaraskan dengan daftar produk KHFY: XLA51 dihapus (sudah tidak ada),
// XLA48/XLA55/XLA77 ditambahkan. Urut berdasarkan angka SKU.
const AKRAB2_ALLOWED_SKUS = [
  "XLA14", "XLA20", "XLA32", "XLA39", "XLA48", "XLA55", "XLA64", "XLA65", "XLA77", "XLA89",
];

const AKRAB1_SKUS = [
  "XDA13","XDA19","XDA25","XDA31","XDA34","XDA38",
  "XDA47","XDA55","XDA63","XDA64","XDA76","XDA88",
  "AM47","AM55","AM63","AM76",
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
  AM47:   [47,  49,  54,  64],
  AM55:   [55,  57,  61,  71],
  AM63:   [63,  65,  70,  80],
  AM76:   [76,  78,  83,  93],
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
  // Ambil stok live dari API Akrab (juraganxl.my.id)
  const akrabStockMap = await fetchAkrabXdaStock();

  if (akrabStockMap === null) {
    logger.warn("Akrab XDA stock tidak tersedia — semua paket akrab1 ditandai stok 0 (fail-safe)");
  }

  return AKRAB1_SKUS.map((sku): PackageItem => {
    const areas = XDA_AREAS[sku] ?? [0, 0, 0, 0];
    const areaText =
      `Area 1 : ${areas[0]}GB\n` +
      `Area 2 : ${areas[1]}GB\n` +
      `Area 3 : ${areas[2]}GB\n` +
      `Area 4 : ${areas[3]}GB`;
    const description = areaText + AKRAB1_NOTES;

    // Stok dari API — active selalu true agar paket tetap tampil dengan ❌ saat habis
    let stock = 0;
    if (akrabStockMap !== null) {
      const item: AkrabStockItem | undefined = akrabStockMap.get(sku);
      if (item) {
        stock = item.open ? item.count : 0;
      }
    }

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
      stock,
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

/**
 * Stok akrab KHFY: SKU (uppercase) → jumlah slot tersisa.
 * Sumbernya endpoint terpisah (`/api_v3/cek_stock_akrab`), bukan `/list_product`
 * yang hanya memuat daftar produk + harga tanpa informasi slot.
 */
export type AkrabStockMap = Map<string, number>;

/**
 * Endpoint stok berada di api_v3 sementara daftar produk di api_v2, jadi versi
 * pada API2_BASE_URL perlu ditukar. Bisa dioverride lewat API2_STOCK_URL.
 */
function resolveAkrabStockUrl(): string {
  const explicit = (process.env.API2_STOCK_URL ?? "").trim();
  if (explicit) return explicit;

  const base = (process.env.API2_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base.replace(/\/api_v\d+$/i, "/api_v3")}/cek_stock_akrab`;
}

/**
 * Ambil sisa slot tiap produk akrab dari KHFY.
 * Mengembalikan null jika data tidak bisa diambil, supaya pemanggil bisa
 * memilih perilaku fail-safe alih-alih menganggap semua produk tersedia.
 */
export async function fetchAkrabStock(): Promise<AkrabStockMap | null> {
  const url = resolveAkrabStockUrl();
  if (!url) {
    logger.warn("Akrab stock URL tidak bisa ditentukan (API2_BASE_URL/API2_STOCK_URL kosong)");
    return null;
  }

  try {
    const res = await axios.get(url, { timeout: 10000 });
    const rows: Record<string, unknown>[] = Array.isArray(res.data?.data)
      ? res.data.data
      : (Array.isArray(res.data) ? res.data : []);

    if (rows.length === 0) {
      logger.warn({ url, body: res.data }, "KHFY cek_stock_akrab: response tanpa data");
      return null;
    }

    const stockMap: AkrabStockMap = new Map();
    for (const row of rows) {
      const kode = String(row.type ?? row.kode_produk ?? row.kode ?? row.sku ?? "")
        .toUpperCase()
        .trim();
      if (!kode) continue;

      const rawSlot = row.sisa_slot ?? row.sisa ?? row.stok ?? row.stock;
      const slot = Number(rawSlot);
      stockMap.set(kode, Number.isFinite(slot) && slot > 0 ? slot : 0);
    }

    if (stockMap.size === 0) {
      logger.warn({ url, sample: rows[0] }, "KHFY cek_stock_akrab: tidak ada SKU yang bisa diparse");
      return null;
    }

    logger.info(
      { slots: Object.fromEntries(stockMap) },
      "Fetched KHFY akrab stock"
    );
    return stockMap;
  } catch (err: any) {
    logger.error(
      { err: err?.response?.data ?? err?.message, url },
      "Failed to fetch KHFY akrab stock"
    );
    return null;
  }
}

function formatKhfyPackage(
  raw: Record<string, unknown>,
  stockMap: AkrabStockMap | null
): PackageItem {
  const sku = String(raw.kode_produk ?? raw.kode ?? raw.produk ?? raw.code ?? raw.sku ?? "");
  // Gunakan kode SKU sebagai nama tampilan (XLA14, XLA32, dst)
const name = sku.toUpperCase().trim() || String(raw.nama_produk ?? raw.nama ?? raw.name ?? sku);
  const price = Number(raw.harga_final ?? raw.harga ?? raw.price ?? 0);
  const desc = String(raw.deskripsi ?? raw.keterangan ?? raw.description ?? "");

  const skuKey = sku.toUpperCase().trim();

  // Sumber utama ketersediaan: sisa_slot dari endpoint cek_stock_akrab.
  // Fail-safe: tanpa data slot, produk dianggap kosong agar bot tidak
  // menawarkan paket yang slotnya sudah habis.
  const slotKnown = stockMap !== null && stockMap.has(skuKey);
  let stock = slotKnown ? (stockMap as AkrabStockMap).get(skuKey)! : 0;

  // Flag opsional dari list_product tetap dihormati sebagai override "tutup".
  const kosong = Number(raw.kosong ?? 0);
  const gangguan = Number(raw.gangguan ?? 0);
  const statusRaw = String(raw.status ?? raw.tersedia ?? raw.available ?? raw.ready ?? "")
    .toUpperCase()
    .trim();
  const statusBad = statusRaw === "KOSONG"
    || statusRaw === "INACTIVE"
    || statusRaw === "GANGGUAN"
    || statusRaw === "FALSE"
    || statusRaw === "NO"
    || statusRaw === "NONAKTIF";

  if (kosong === 1 || gangguan === 1 || statusBad) {
    stock = 0;
  }

  logger.debug(
    { sku, skuKey, slotKnown, stock, kosong, gangguan, statusRaw },
    "KHFY product availability"
  );

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
    stock,
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
    const [res, stockMap] = await Promise.all([
      axios.get(url, { timeout: 10000 }),
      fetchAkrabStock(),
    ]);

    const raw: Record<string, unknown>[] = Array.isArray(res.data)
      ? res.data
      : (Array.isArray(res.data?.data) ? res.data.data : []);

    const filtered = raw.filter((r) => {
      const kode = String(r.kode_produk ?? r.kode ?? r.produk ?? r.code ?? r.sku ?? "").toUpperCase();
      return AKRAB2_ALLOWED_SKUS.includes(kode);
    });

    if (stockMap === null) {
      logger.error(
        "KHFY stock tidak tersedia — semua paket AKRAB 2 ditandai kosong (fail-safe)"
      );
    }

    const packages = filtered.map((item) => formatKhfyPackage(item, stockMap));
    logger.info(
      {
        count: packages.length,
        stockSource: stockMap === null ? "unavailable" : "cek_stock_akrab",
        stocks: packages.map((p) => ({ sku: p.sku, stock: p.stock })),
      },
      "Fetched AKRAB 2 packages from KHFY"
    );
    return packages;
  } catch (err) {
    logger.error({ err }, "Failed to fetch akrab2 packages from KHFY API");
    return [];
  }
}

const DIGIFLAZ_CIRCLE_SKUS: Array<{ sku: string; name: string; description: string; quota: string; validity: string }> = [
  {
    sku: "Mal30",
    name: "Masa Aktif",
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
  // PRE ORDER menggunakan produk yang sama dengan AKRAB 2 (KHFY)
  setApiPackages("preorder", akrab2);
  logger.info(
    { akrab1Count: akrab1.length, circleCount: circle.length, akrab2Count: akrab2.length },
    "Packages refreshed"
  );
}

export function startPackageRefreshScheduler(intervalMs = 5 * 60 * 1000) {
  refreshAllPackages();
  setInterval(refreshAllPackages, intervalMs);
}
