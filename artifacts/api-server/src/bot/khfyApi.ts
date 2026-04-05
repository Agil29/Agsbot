import axios from "axios";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

export type KhfyOrderResult =
  | { success: true; sn: string; message: string; reffId: string }
  | { success: false; error: string; reffId: string };

export async function placeKhfyOrder(params: {
  sku: string;
  tujuan: string;
  reffId?: string;
}): Promise<KhfyOrderResult> {
  const apiKey = process.env.API2_KEY ?? "";
  const baseUrl = process.env.API2_BASE_URL ?? "";
  const reffId = params.reffId ?? randomUUID();

  if (!apiKey || !baseUrl) {
    return { success: false, error: "API AKRAB 2 belum dikonfigurasi.", reffId };
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
        message: String(data.message ?? data.pesan ?? "Order berhasil."),
        reffId,
      };
    }

    return {
      success: false,
      error: String(data.message ?? data.pesan ?? data.error ?? "Order gagal dari provider."),
      reffId,
    };
  } catch (err: any) {
    logger.error({ err: err?.response?.data ?? err?.message }, "KHFY /trx error");
    const msg = err?.response?.data?.message ?? err?.message ?? "Gagal menghubungi API provider.";
    return { success: false, error: msg, reffId };
  }
}
