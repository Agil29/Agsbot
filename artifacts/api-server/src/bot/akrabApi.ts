import axios from "axios";
import { logger } from "../lib/logger";

export type AkrabStockItem = {
  config: string;   // kode produk, e.g. "XDA13"
  count: number;    // jumlah slot tersedia
  open: boolean;    // true = ready, false = habis
};

/**
 * Scrape data stok XDA dari halaman publik juraganxl.my.id.
 * Tidak butuh API key atau CSRF token.
 * Mengembalikan Map: SKU (uppercase) → AkrabStockItem
 * Mengembalikan null jika gagal.
 */
export async function fetchAkrabXdaStock(): Promise<Map<string, AkrabStockItem> | null> {
  const baseUrl = (process.env.CEK_STOK_AKRAB1_URL ?? "https://juraganxl.my.id").replace(/\/+$/, "");

  try {
    const res = await axios.get(baseUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgsBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      timeout: 15000,
    });

    const html: string = typeof res.data === "string" ? res.data : "";
    if (!html) {
      logger.warn("Akrab scrape: response kosong");
      return null;
    }

    const stockMap = new Map<string, AkrabStockItem>();

    // Pola: nama SKU diikuti status (HABIS/READY) dan angka slot
    // Contoh dari HTML: "XDA13" ... "HABIS" ... "0" atau "XDA63" ... "READY" ... "59"
    // Regex menangkap blok per produk
    const blockRegex = /###\s*(XDA\d+|AM\d+)([\s\S]*?)(?=###\s*(?:XDA|AM)\d+|$)/gi;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(html)) !== null) {
      const sku = match[1].toUpperCase().trim();
      const block = match[2];

      // Ambil angka slot (cari angka standalone dalam blok)
      const slotMatch = block.match(/\b(\d+)\b/);
      const slot = slotMatch ? parseInt(slotMatch[1], 10) : 0;

      // Cek status
      const isReady = /READY/i.test(block);
      const isHabis = /HABIS/i.test(block);
      const open = isReady && !isHabis && slot > 0;

      stockMap.set(sku, { config: sku, count: slot, open });
    }

    if (stockMap.size === 0) {
      logger.warn({ url: baseUrl }, "Akrab scrape: tidak ada SKU yang bisa diparse dari HTML");
      return null;
    }

    logger.info(
      { count: stockMap.size, stocks: Object.fromEntries([...stockMap.entries()].map(([k, v]) => [k, v.count])) },
      "Fetched Akrab XDA stock via scrape"
    );
    return stockMap;

  } catch (err: any) {
    logger.error(
      { err: err?.response?.status ?? err?.message, url: baseUrl },
      "Failed to scrape Akrab XDA stock"
    );
    return null;
  }
}
