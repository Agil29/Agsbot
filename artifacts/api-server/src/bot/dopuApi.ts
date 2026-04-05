import axios from "axios";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

export type DopuOrderResult =
  | { success: true; sn: string; note: string; reffId: string }
  | { success: false; error: string; note: string; reffId: string };

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
    return { success: false, error: "API DOPU belum dikonfigurasi.", note: "API DOPU belum dikonfigurasi.", reffId };
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

    // Trim raw to a reasonable display length
    const note = raw.length > 300 ? raw.slice(0, 300) + "..." : raw;

    const upper = raw.toUpperCase();
    if (upper.includes("SUKSES") || upper.includes("SUCCESS") || upper.includes("BERHASIL")) {
      const snMatch =
        raw.match(/SN\/Ref[:\s]+(\S+)/i) ??
        raw.match(/"sn"\s*:\s*"([^"]+)"/i) ??
        raw.match(/\bSN[:\s]+(\S+)/i);
      return { success: true, sn: snMatch?.[1] ?? reffId, note, reffId };
    }

    let errorMsg = "Transaksi gagal";
    if (upper.includes("KOSONG") || upper.includes("STOK")) {
      errorMsg = "Stok sedang kosong/ditutup";
    } else if (upper.includes("NOMOR")) {
      errorMsg = "Nomor tujuan tidak valid";
    } else if (upper.includes("IP") || upper.includes("ALAMAT")) {
      errorMsg = "IP server belum terdaftar di DOPU. Hubungi admin.";
    } else if (upper.includes("SALDO")) {
      errorMsg = "Saldo DOPU tidak cukup. Hubungi admin.";
    } else if (upper.includes("GAGAL") || upper.includes("FAILED")) {
      const match = raw.match(/GAGAL[,.\s!]+([^\n*]+)/i);
      if (match) errorMsg = match[1].trim().slice(0, 100);
    }

    return { success: false, error: errorMsg, note, reffId };
  } catch (err: any) {
    logger.error({ err, sku: params.sku }, "DOPU API request failed");
    const errNote = err?.response?.data
      ? String(err.response.data).slice(0, 200)
      : "Koneksi ke server DOPU gagal";
    return {
      success: false,
      error: errNote.slice(0, 100),
      note: errNote,
      reffId,
    };
  }
}
