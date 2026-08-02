import axios from "axios";
import { logger } from "../lib/logger";

export type AkrabStockItem = {
  config: string;           // kode produk, e.g. "XDA13"
  count: number;            // jumlah stok tersedia
  open: boolean;            // true = buka, false = gangguan
  quota_allocation: Record<string, number> | string;
};

/**
 * Fetch stok produk XDA dari API Akrab (juraganxl.my.id).
 * Mengembalikan Map: SKU (uppercase) → AkrabStockItem
 * Mengembalikan null jika gagal, agar caller bisa fail-safe.
 */
export async function fetchAkrabXdaStock(): Promise<Map<string, AkrabStockItem> | null> {
  const baseUrl = (process.env.CEK_STOK_AKRAB1_URL ?? "https://juraganxl.my.id").replace(/\/+$/, "");
  const apiKey = process.env.AKRAB_API_KEY ?? "";

  if (!apiKey) {
    logger.warn("AKRAB_API_KEY tidak dikonfigurasi — skip fetch stok XDA");
    return null;
  }

  try {
    const res = await axios.get(`${baseUrl}/api/regulers`, {
      headers: { "x-api-key": apiKey },
      timeout: 10000,
    });

    const raw: unknown = res.data;
    const rows: Record<string, unknown>[] = Array.isArray(raw) ? raw : [];

    if (rows.length === 0) {
      logger.warn({ url: `${baseUrl}/api/regulers`, body: raw }, "Akrab API: response kosong atau bukan array");
      return null;
    }

    const stockMap = new Map<string, AkrabStockItem>();
    for (const row of rows) {
      const config = String(row.config ?? "").toUpperCase().trim();
      if (!config) continue;

      stockMap.set(config, {
        config,
        count: Number(row.count ?? 0),
        open: row.open === true,
        quota_allocation: (row.quota_allocation ?? {}) as Record<string, number>,
      });
    }

    logger.info(
      { count: stockMap.size, items: [...stockMap.keys()] },
      "Fetched Akrab XDA stock from API"
    );
    return stockMap;
  } catch (err: any) {
    logger.error(
      { err: err?.response?.data ?? err?.message, url: `${baseUrl}/api/regulers` },
      "Failed to fetch Akrab XDA stock"
    );
    return null;
  }
}
