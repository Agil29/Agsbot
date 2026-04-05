import axios from "axios";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

export type DopuOrderResult =
  | { success: true; sn: string; message: string; reffId: string }
  | { success: false; error: string; reffId: string };

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
    return { success: false, error: "API DOPU belum dikonfigurasi.", reffId };
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

    const upper = raw.toUpperCase();
    if (upper.includes("SUKSES") || upper.includes("SUCCESS") || upper.includes("BERHASIL")) {
      const snMatch = raw.match(/SN\/Ref[:\s]+(\S+)/i)
        ?? raw.match(/"sn"\s*:\s*"([^"]+)"/i)
        ?? raw.match(/sn[:\s]+(\S+)/i);
      return { success: true, sn: snMatch?.[1] ?? "", message: raw, reffId };
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

    return { success: false, error: errorMsg, reffId };
  } catch (err: any) {
    logger.error({ err, sku: params.sku }, "DOPU API request failed");
    return {
      success: false,
      error: err?.response?.data ? String(err.response.data).slice(0, 100) : "Koneksi ke server DOPU gagal",
      reffId,
    };
  }
}
