import axios from "axios";
import { logger } from "../lib/logger";

/**
 * Stok akrab XDA: SKU (uppercase) → jumlah slot tersisa.
 * Source: juraganxl.my.id/api/regulers
 * Pola sama persis dengan fetchAkrabStock() untuk akrab v2 (KHFY).
 */
export type XdaStockMap = Map<string, number>;

export async function fetchXdaStock(): Promise<XdaStockMap | null> {
  const base = (process.env.CEK_STOK_AKRAB1_URL ?? "https://juraganxl.my.id").replace(/\/+$/, "");
  const apiKey = process.env.AKRAB_API_KEY ?? "";
  const url = `${base}/api/regulers`;

  if (!apiKey) {
    logger.warn("AKRAB_API_KEY tidak dikonfigurasi — skip fetch stok XDA");
    return null;
  }

  try {
    const res = await axios.get(url, {
      headers: {
        "x-api-key": apiKey,
        "Origin": base,
        "Referer": `${base}/`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, */*",
      },
      timeout: 10000,
    });

    // Response: JSON array [{ config, count, open, quota_allocation }, ...]
    const rows: Record<string, unknown>[] = Array.isArray(res.data) ? res.data : [];

    if (rows.length === 0) {
      logger.warn({ url, body: res.data }, "juraganxl API: response tanpa data");
      return null;
    }

    const stockMap: XdaStockMap = new Map();
    for (const row of rows) {
      // field: config = kode SKU (e.g. "XDA13"), count = slot, open = boolean
      const kode = String(row.config ?? row.kode ?? row.sku ?? "")
        .toUpperCase()
        .trim();
      if (!kode) continue;

      const rawSlot = row.count ?? row.slot ?? row.sisa_slot ?? row.stock;
      const slot = Number(rawSlot);
      const open = row.open === true;

      // Hanya masuk jika open dan ada stok
      stockMap.set(kode, open && Number.isFinite(slot) && slot > 0 ? slot : 0);
    }

    if (stockMap.size === 0) {
      logger.warn({ url, sample: rows[0] }, "juraganxl API: tidak ada SKU yang bisa diparse");
      return null;
    }

    logger.info(
      { slots: Object.fromEntries(stockMap) },
      "Fetched XDA stock from juraganxl"
    );
    return stockMap;

  } catch (err: any) {
    logger.error(
      { status: err?.response?.status, msg: err?.message, url },
      "Failed to fetch XDA stock from juraganxl"
    );
    return null;
  }
}
