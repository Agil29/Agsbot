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
} {
  const upper = raw.toUpperCase();

  // --- Format 1: query-string (status=0 / status=1) ---
  if (/status=\d/i.test(raw)) {
    try {
      const params = new URLSearchParams(raw);
      const status = params.get("status") ?? "";
      const message = params.get("message") ?? raw;
      const msgUpper = message.toUpperCase();

      if (status === "1") {
        // DOPU accepted the order for async processing — PENDING, not final
        const trxMatch = message.match(/#trx[:\s]*(\d+)/i) ?? message.match(/\btrx[:\s]*(\d+)/i);
        const sn = trxMatch?.[1] ?? "";
        return { success: true, pending: true, sn, errorMsg: "" };
      }

      // status != 1 → synchronous failure
      let errorMsg = "Transaksi gagal";
      if (msgUpper.includes("IP") || msgUpper.includes("ALAMAT")) {
        errorMsg = "IP server belum terdaftar. Hubungi admin.";
      } else if (msgUpper.includes("SALDO")) {
        errorMsg = "Stok tidak tersedia. Hubungi admin.";
      } else if (msgUpper.includes("KOSONG") || msgUpper.includes("STOK")) {
        errorMsg = "Stok sedang kosong/ditutup";
      } else if (msgUpper.includes("NOMOR")) {
        errorMsg = "Nomor tujuan tidak valid";
      } else if (message.trim().length > 0) {
        errorMsg = message.trim().slice(0, 120);
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

  let errorMsg = "Transaksi gagal";
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
  if (!memberId || !pin) return null;
  try {
    const res = await axios.get(`${baseUrl}/saldo`, {
      params: { memberID: memberId, pin },
      timeout: 10000,
    });
    const data = res.data;
    if (typeof data === "string") {
      const match = data.match(/saldo[=:\s]*([0-9,.]+)/i);
      if (match) return Number(match[1].replace(/[,.]/g, "").replace(/\./g, ""));
    }
    if (typeof data === "object") {
      const val = data.saldo ?? data.balance ?? data.kredit ?? data.credit;
      if (val !== undefined) return Number(val);
    }
    return null;
  } catch {
    return null;
  }
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
      },
      timeout: 30000,
    });

    const raw = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    logger.info({ sku: params.sku, tujuan: params.tujuan, reffId, raw }, "DOPU trx response");

    const parsed = parseDopuResponse(raw);

    if (parsed.success) {
      return { success: true, pending: parsed.pending, sn: parsed.sn || reffId, reffId };
    }
    return { success: false, error: parsed.errorMsg, reffId };

  } catch (err: any) {
    logger.error({ err, sku: params.sku }, "DOPU API request failed");
    const errMsg = err?.response?.data
      ? String(err.response.data).slice(0, 100)
      : "Koneksi ke server DOPU gagal";
    return { success: false, error: errMsg, reffId };
  }
}
