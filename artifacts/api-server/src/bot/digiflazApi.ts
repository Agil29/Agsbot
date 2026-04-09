import axios from "axios";
import { createHash } from "crypto";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";

const BASE_URL = "https://api.digiflazz.com/v1";

function md5(str: string): string {
  return createHash("md5").update(str).digest("hex");
}

function getCreds(): { username: string; apiKey: string } {
  return {
    username: process.env.DIGIFLAZ_USERNAME ?? "",
    apiKey: process.env.DIGIFLAZ_API_KEY ?? "",
  };
}

export type DigiflazOrderResult =
  | { success: true; pending: boolean; sn: string; refId: string }
  | { success: false; error: string; refId: string };

let _priceListCache: any[] | null = null;
let _priceListFetchedAt = 0;
const PRICE_LIST_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function fetchDigiflazPriceList(): Promise<any[]> {
  const now = Date.now();
  if (_priceListCache && now - _priceListFetchedAt < PRICE_LIST_TTL_MS) {
    return _priceListCache;
  }
  const { username, apiKey } = getCreds();
  if (!username || !apiKey) return [];
  const sign = md5(username + apiKey + "pricelist");
  const res = await axios.post(
    `${BASE_URL}/price-list`,
    { cmd: "prepaid", username, sign },
    { timeout: 15000 }
  );
  const raw = res.data;
  const list: any[] = Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw)
    ? raw
    : [];
  if (list.length > 0) {
    _priceListCache = list;
    _priceListFetchedAt = now;
    logger.info({ count: list.length }, "Digiflaz price list cached");
  } else {
    logger.warn({ raw: JSON.stringify(raw).slice(0, 200) }, "Digiflaz price list empty or rate-limited");
  }
  return list;
}

export async function getDigiflazPrice(sku: string): Promise<number> {
  try {
    const list = await fetchDigiflazPriceList();
    const item = list.find((p: any) => p.buyer_sku_code === sku);
    const price = Number(item?.price ?? 0);
    logger.info({ sku, price }, "Fetched Digiflaz price");
    return price;
  } catch (err) {
    logger.error({ err, sku }, "Failed to fetch Digiflaz price list");
    return 0;
  }
}

export type DigiflazStatusResult =
  | { status: "success"; sn: string }
  | { status: "pending" }
  | { status: "failed"; error: string };

export async function checkDigiflazOrderStatus(refId: string): Promise<DigiflazStatusResult> {
  const { username, apiKey } = getCreds();
  if (!username || !apiKey) return { status: "failed", error: "Digiflaz belum dikonfigurasi" };

  try {
    const sign = md5(username + apiKey + refId);
    const res = await axios.post(
      `${BASE_URL}/transaction`,
      {
        username,
        ref_id: refId,
        sign,
      },
      { timeout: 15000 }
    );

    // Try both response shapes: { data: { ... } } and { ... }
    const data = res.data?.data ?? res.data;
    const rawStatus = String(data?.status ?? "");
    const status = rawStatus.toLowerCase();
    const sn = String(data?.sn ?? data?.serial_number ?? "");

    // Also check the "message" field as fallback (Digiflaz sometimes uses message instead of status)
    const msgRaw = String(data?.message ?? "");
    const msg = msgRaw.toLowerCase();

    logger.info({ refId, status, sn, msg, raw: JSON.stringify(res.data).slice(0, 400) }, "Digiflaz status check result");

    const isSuccess =
      status === "sukses" || status === "success" ||
      msg === "sukses" || msg === "success";

    const isFailed =
      status === "gagal" || status === "failed" || status === "failure" ||
      status.includes("gagal") || status.includes("failed") ||
      msg.includes("gagal") || msg.includes("failed");

    const isPendingStatus =
      status === "pending" || status === "" ||
      status.includes("pending") || status.includes("antri") || status.includes("proses") ||
      msg.includes("pending") || msg.includes("antri") || msg.includes("proses");

    if (isSuccess) {
      return { status: "success", sn };
    } else if (isFailed) {
      const error = msgRaw || rawStatus || "Transaksi gagal di Digiflaz";
      return { status: "failed", error };
    } else if (isPendingStatus) {
      return { status: "pending" };
    } else {
      // Unknown status — log and treat as pending so polling continues
      logger.warn({ refId, status, msg, data: JSON.stringify(data).slice(0, 300) }, "Digiflaz unknown status — treating as pending");
      return { status: "pending" };
    }
  } catch (err: any) {
    // Extract error body from HTTP error response if available
    const responseData = err?.response?.data;
    const errBody = responseData?.data?.message ?? responseData?.message ?? "";
    const errMsg = errBody || err?.message || "Kesalahan koneksi ke Digiflaz";
    const httpStatus = err?.response?.status;
    logger.error({ err: errMsg, httpStatus, refId }, "Digiflaz status check error");
    // Treat connection/server errors as still pending
    return { status: "pending" };
  }
}

export async function placeDigiflazOrder(opts: {
  sku: string;
  tujuan: string;
  refId?: string;
}): Promise<DigiflazOrderResult> {
  const { username, apiKey } = getCreds();
  if (!username || !apiKey) {
    return { success: false, error: "Digiflaz belum dikonfigurasi", refId: opts.refId ?? "" };
  }

  const refId = opts.refId ?? randomUUID().replace(/-/g, "").slice(0, 20);
  const sign = md5(username + apiKey + refId);

  try {
    const res = await axios.post(
      `${BASE_URL}/transaction`,
      {
        username,
        buyer_sku_code: opts.sku,
        customer_no: opts.tujuan,
        ref_id: refId,
        sign,
        commands: "buy",
      },
      { timeout: 30000 }
    );

    const data = res.data?.data;
    if (!data) {
      return { success: false, error: "Response tidak valid dari Digiflaz", refId };
    }

    const status = String(data.status ?? "").toLowerCase();
    const sn = String(data.sn ?? "");
    const message = String(data.message ?? data.rc ?? "Transaksi gagal");

    logger.info({ sku: opts.sku, refId, status, sn }, "Digiflaz transaction response");

    if (status === "sukses" || status === "success") {
      return { success: true, pending: false, sn, refId };
    } else if (status === "pending") {
      return { success: true, pending: true, sn, refId };
    } else {
      return { success: false, error: message || "Transaksi gagal di Digiflaz", refId };
    }
  } catch (err: any) {
    const errMsg =
      err?.response?.data?.data?.message ??
      err?.response?.data?.message ??
      err?.message ??
      "Kesalahan koneksi ke Digiflaz";
    logger.error({ err: errMsg, sku: opts.sku, refId }, "Digiflaz order error");
    return { success: false, error: errMsg, refId };
  }
}
