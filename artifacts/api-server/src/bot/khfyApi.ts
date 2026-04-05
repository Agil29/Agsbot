import axios from "axios";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

export type KhfyOrderResult =
  | { success: true; sn: string; message: string; reffId: string }
  | { success: false; error: string; reffId: string };

export async function getKhfyBalance(): Promise<number | null> {
  const apiKey = process.env.API2_KEY ?? "";
  const baseUrl = process.env.API2_BASE_URL ?? "";
  if (!apiKey || !baseUrl) return null;
  try {
    const res = await axios.get(`${baseUrl}/saldo`, {
      params: { api_key: apiKey },
      timeout: 10000,
    });
    const data = res.data ?? {};
    const val = data.saldo ?? data.balance ?? data.kredit ?? data.credit;
    if (val !== undefined) return Number(val);
    return null;
  } catch {
    return null;
  }
}

export async function placeKhfyOrder(params: {
  sku: string;
  tujuan: string;
  reffId?: string;
}): Promise<KhfyOrderResult> {
  const apiKey = process.env.API2_KEY ?? "";
  const baseUrl = process.env.API2_BASE_URL ?? "";
  const reffId = params.reffId ?? randomUUID();

  if (!apiKey || !baseUrl) {
    return { success: false, error: "Layanan belum dikonfigurasi. Hubungi admin.", reffId };
  }

  try {
    const res = await axios.get(`${baseUrl}/trx`, {
      params: { produk: params.sku, tujuan: params.tujuan, reff_id: reffId, api_key: apiKey },
      timeout: 30000,
    });

    const data = res.data ?? {};
    logger.info({ data, sku: params.sku, tujuan: params.tujuan }, "KHFY /trx response");

    const status = String(data.status ?? "").toLowerCase();
    const ok = data.ok === true || status === "sukses" || status === "success" || status === "berhasil";

    if (ok) {
      return {
        success: true,
        sn: String(data.sn ?? data.serial ?? data.no_seri ?? ""),
        message: String(data.message ?? data.msg ?? data.pesan ?? "Order berhasil."),
        reffId,
      };
    }

    // Extract error reason — KHFY uses msg, message, pesan, or error field
    const rawError = String(data.message ?? data.msg ?? data.pesan ?? data.error ?? "");
    let errorMsg = "Order gagal. Hubungi admin.";
    if (rawError) {
      const upper = rawError.toUpperCase();
      if (upper.includes("KOSONG") || upper.includes("STOK")) {
        errorMsg = "Stok sedang kosong. Coba lagi nanti.";
      } else if (upper.includes("NOMOR") || upper.includes("TUJUAN")) {
        errorMsg = "Nomor tujuan tidak valid.";
      } else if (upper.includes("SALDO")) {
        errorMsg = "Stok tidak tersedia. Hubungi admin.";
      } else {
        // Use sanitized raw error (strip internal IDs like RC=... TrxID=...)
        errorMsg = rawError
          .replace(/RC=[^\s]+\s*/gi, "")
          .replace(/TrxID=[^\s]*\s*/gi, "")
          .replace(/@\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}/g, "")
          .replace(/#/g, "")
          .trim()
          .slice(0, 120) || "Order gagal. Hubungi admin.";
      }
    }

    return { success: false, error: errorMsg, reffId };
  } catch (err: any) {
    logger.error({ err: err?.response?.data ?? err?.message }, "KHFY /trx error");
    const msg = err?.response?.data?.message ?? err?.message ?? "Gagal terhubung ke server. Coba lagi.";
    return { success: false, error: msg, reffId };
  }
}
