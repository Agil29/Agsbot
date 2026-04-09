import axios from "axios";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

export type DopuOrderResult =
  | { success: true; pending: boolean; sn: string; reffId: string }
  | { success: false; error: string; reffId: string };

/**
 * Parse DOPU response — supports two formats:
 *   1. Query-string: "status=1&message=* CIRCLE ... #trx:403299 ..."
 *      status=1 = accepted for async processing (PENDING, not final success)
 *      status=0 = synchronous failure (IP error, saldo kurang, etc.)
 *   2. Plain-text: "SUKSES/BERHASIL ... SN: XXXXX" or "Alamat IP tidak sesuai"
 */
function parseDopuResponse(raw: string): {
  success: boolean;
  pending: boolean;
  sn: string;
  errorMsg: string;
  rateLimit?: boolean;
} {
  const upper = raw.toUpperCase();

  // Rate limit — signal caller to handle separately
  if (upper.includes("TOO MANY") || upper.includes("RATE LIMIT") || upper.includes("BANYAK PERMINTAAN")) {
    return { success: false, pending: false, sn: "", errorMsg: "Server DOPU sedang sibuk. Coba beberapa menit lagi.", rateLimit: true };
  }

  // --- Format 1: query-string (status=0 / status=1) ---
  if (/status=\d/i.test(raw)) {
    try {
      const params = new URLSearchParams(raw);
      const status = params.get("status") ?? "";
      const message = params.get("message") ?? raw;
      const msgUpper = message.toUpperCase();

      // Rate limit inside query-string response
      if (msgUpper.includes("TOO MANY") || msgUpper.includes("RATE LIMIT")) {
        return { success: false, pending: false, sn: "", errorMsg: "Server DOPU sedang sibuk. Coba beberapa menit lagi.", rateLimit: true };
      }

      if (status === "1") {
        // DOPU accepted the order for async processing — PENDING, not final
        const trxMatch = message.match(/#trx[:\s]*(\d+)/i) ?? message.match(/\btrx[:\s]*(\d+)/i);
        const sn = trxMatch?.[1] ?? "";
        return { success: true, pending: true, sn, errorMsg: "" };
      }

      // status != 1 → synchronous failure
      let errorMsg = message.trim().slice(0, 120) || "Transaksi gagal";
      if (msgUpper.includes("IP") || msgUpper.includes("ALAMAT")) {
        errorMsg = "IP server belum terdaftar. Hubungi admin.";
      } else if (msgUpper.includes("SALDO")) {
        errorMsg = "Stok tidak tersedia. Hubungi admin.";
      } else if (msgUpper.includes("KOSONG") || msgUpper.includes("STOK")) {
        errorMsg = "Stok sedang kosong/ditutup";
      } else if (msgUpper.includes("NOMOR")) {
        errorMsg = "Nomor tujuan tidak valid";
      }
      return { success: false, pending: false, sn: "", errorMsg };
    } catch {
      // fall through
    }
  }

  // --- Format 2: plain-text immediate result ---
  if (upper.includes("SUKSES") || upper.includes("SUCCESS") || upper.includes("BERHASIL")) {
    const snMatch =
      raw.match(/#trx[:\s]*(\d+)/i) ??
      raw.match(/SN\/Ref[:\s]+(\S+)/i) ??
      raw.match(/"sn"\s*:\s*"([^"]+)"/i) ??
      raw.match(/\bSN[:\s]+(\S+)/i);
    return { success: true, pending: false, sn: snMatch?.[1] ?? "", errorMsg: "" };
  }

  // DOPU "PENDING" / antrian responses
  if (upper.includes("ANTRI") || upper.includes("PENDING") || upper.includes("PROSES") || upper.includes("MENUNGGU")) {
    return { success: true, pending: true, sn: "", errorMsg: "" };
  }

  let errorMsg = raw.trim().slice(0, 120) || "Transaksi gagal";
  if (upper.includes("IP") || upper.includes("ALAMAT")) {
    errorMsg = "IP server belum terdaftar. Hubungi admin.";
  } else if (upper.includes("SALDO")) {
    errorMsg = "Stok tidak tersedia. Hubungi admin.";
  } else if (upper.includes("KOSONG") || upper.includes("STOK")) {
    errorMsg = "Stok sedang kosong/ditutup";
  } else if (upper.includes("NOMOR")) {
    errorMsg = "Nomor tujuan tidak valid";
  } else if (upper.includes("GAGAL") || upper.includes("FAILED")) {
    const match = raw.match(/GAGAL[,.\s!]+([^\n*]+)/i);
    if (match) errorMsg = match[1].trim().slice(0, 120);
  }
  return { success: false, pending: false, sn: "", errorMsg };
}

export async function getDopuBalance(): Promise<number | null> {
  const baseUrl = process.env.DOPU_BASE_URL ?? "http://141.11.190.108:8182";
  const memberId = process.env.DOPU_MEMBER_ID ?? "";
  const pin = process.env.DOPU_PIN ?? "";
  const password = process.env.DOPU_PASSWORD ?? "";
  if (!memberId || !pin) return null;
  try {
    const res = await axios.get(`${baseUrl}/saldo`, {
      params: { memberID: memberId, pin, password },
      timeout: 10000,
    });
    const data = res.data;
    if (typeof data === "string") {
      // Handles: "Saldo : Rp 354.867" or "saldo=354867" or "Saldo: 354867"
      // Skip optional "Rp" and grab the first number after "saldo"
      const match = data.match(/saldo[^0-9]*([0-9][0-9.,]*)/i);
      if (match) {
        // Indonesian format: 354.867 = 354867 (dot as thousand separator)
        return Number(match[1].replace(/\./g, "").replace(/,/g, ""));
      }
    }
    if (typeof data === "object" && data !== null) {
      const val = data.saldo ?? data.balance ?? data.kredit ?? data.credit;
      if (val !== undefined) return Number(String(val).replace(/\./g, "").replace(/,/g, ""));
    }
    logger.warn({ raw: String(data).slice(0, 200) }, "DOPU /saldo: unexpected format");
    return null;
  } catch (err: any) {
    logger.warn({ err: err?.message }, "DOPU /saldo request failed");
    return null;
  }
}

export type DopuStatusResult =
  | { status: "success"; sn: string }
  | { status: "pending" }
  | { status: "failed"; error: string };

/**
 * Check the status of a pending DOPU order.
 * Tries /cek with refID, then trxID (DOPU's own #trx number) if available.
 * Returns: success (delivered), pending (still processing), or failed.
 */
export async function checkDopuOrderStatus(reffId: string, trxId?: string): Promise<DopuStatusResult> {
  const baseUrl = process.env.DOPU_BASE_URL ?? "http://141.11.190.108:8182";
  const memberId = process.env.DOPU_MEMBER_ID ?? "";
  const pin = process.env.DOPU_PIN ?? "";

  if (!memberId || !pin) return { status: "pending" };

  function parseRaw(raw: string, identifier: string): DopuStatusResult | null {
    const trimmed = raw.trim();
    const upper = trimmed.toUpperCase();

    // Rate limited — signal caller to back off
    if (upper.includes("TOO MANY") || upper.includes("RATE LIMIT") || upper.includes("BANYAK PERMINTAAN")) {
      return { status: "ratelimit" as any };
    }

    // "OK" from DOPU /cek is only an acknowledgment — NOT a status indicator.
    // DOPU returns "OK" for both failed and pending orders, so we ignore it.
    if (upper === "OK") {
      return null; // treat as unknown/pending — wait for real status
    }

    if (/status=\d/i.test(trimmed)) {
      const qp = new URLSearchParams(trimmed);
      const st = qp.get("status") ?? "";
      const message = qp.get("message") ?? trimmed;
      const msgUpper = message.toUpperCase();

      if (st === "1") {
        if (msgUpper.includes("SUKSES") || msgUpper.includes("BERHASIL") || msgUpper.includes("SUCCESS")) {
          const snMatch = message.match(/#trx[:\s]*(\d+)/i) ?? message.match(/\bSN[:\s]+(\S+)/i);
          return { status: "success", sn: snMatch?.[1] ?? identifier };
        }
        return { status: "pending" };
      }

      if (st === "0") {
        const error = message.trim().length > 0 ? message.trim().slice(0, 120) : "Transaksi gagal";
        return { status: "failed", error };
      }

      return { status: "pending" };
    }

    if (upper.includes("SUKSES") || upper.includes("SUCCESS") || upper.includes("BERHASIL")) {
      const snMatch = trimmed.match(/#trx[:\s]*(\d+)/i) ?? trimmed.match(/\bSN[:\s]+(\S+)/i);
      return { status: "success", sn: snMatch?.[1] ?? identifier };
    }
    if (upper.includes("GAGAL") || upper.includes("FAILED") || upper.includes("BATAL")) {
      return { status: "failed", error: trimmed.slice(0, 120) };
    }
    if (upper.includes("PROSES") || upper.includes("PENDING") || upper.includes("ANTRI") || upper.includes("MENUNGGU")) {
      return { status: "pending" };
    }

    return null;
  }

  // Try with refID first, then with DOPU's own trxID
  const paramSets = [
    { memberID: memberId, pin, refID: reffId },
    ...(trxId ? [{ memberID: memberId, pin, trxID: trxId }] : []),
    ...(trxId ? [{ memberID: memberId, pin, id: trxId }] : []),
  ];

  for (const params of paramSets) {
    try {
      const res = await axios.get(`${baseUrl}/cek`, { params, timeout: 15000 });
      const raw = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      logger.info({ reffId, trxId, params, raw }, "DOPU cek response");

      const parsed = parseRaw(raw, trxId ?? reffId);
      if (parsed) return parsed;
    } catch (err: any) {
      const errMsg = err?.response?.status
        ? `HTTP ${err.response.status}: ${String(err.response.data ?? "").slice(0, 80)}`
        : String(err?.message ?? err).slice(0, 80);
      logger.warn({ reffId, trxId, params, errMsg }, "DOPU cek attempt failed");
    }
  }

  // All attempts failed or returned unknown — still pending
  return { status: "pending" };
}

export async function placeDopuOrder(params: {
  sku: string;
  tujuan: string;
  reffId?: string;
}): Promise<DopuOrderResult> {
  const baseUrl = process.env.DOPU_BASE_URL ?? "http://141.11.190.108:8182";
  const memberId = process.env.DOPU_MEMBER_ID ?? "";
  const pin = process.env.DOPU_PIN ?? "";
  const password = process.env.DOPU_PASSWORD ?? "";
  const reffId = params.reffId ?? randomUUID().replace(/-/g, "").slice(0, 20);

  if (!memberId || !pin) {
    return { success: false, error: "Layanan belum dikonfigurasi. Hubungi admin.", reffId };
  }

  // Build callback URL for real-time DOPU notification
  const serverHost = process.env.SERVER_URL
    ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  const callbackUrl = serverHost ? `${serverHost}/api/webhook/dopu` : undefined;

  try {
    const res = await axios.get(`${baseUrl}/trx`, {
      params: {
        product: params.sku,
        qty: 1,
        dest: params.tujuan,
        refID: reffId,
        memberID: memberId,
        pin,
        password,
        ...(callbackUrl ? { callback: callbackUrl } : {}),
      },
      timeout: 30000,
    });

    const raw = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    logger.info({ sku: params.sku, tujuan: params.tujuan, reffId, raw: raw.slice(0, 300) }, "DOPU trx response");

    const parsed = parseDopuResponse(raw);

    if (parsed.rateLimit) {
      logger.warn({ sku: params.sku, reffId }, "DOPU /trx rate limited — order not placed");
      return { success: false, error: parsed.errorMsg, reffId };
    }

    if (parsed.success) {
      return { success: true, pending: parsed.pending, sn: parsed.sn || reffId, reffId };
    }
    logger.warn({ sku: params.sku, reffId, raw: raw.slice(0, 300), errorMsg: parsed.errorMsg }, "DOPU /trx returned failure");
    return { success: false, error: parsed.errorMsg, reffId };

  } catch (err: any) {
    logger.error({ err, sku: params.sku }, "DOPU API request failed");
    const errMsg = err?.response?.data
      ? String(err.response.data).slice(0, 100)
      : "Koneksi ke server DOPU gagal";
    return { success: false, error: errMsg, reffId };
  }
}
