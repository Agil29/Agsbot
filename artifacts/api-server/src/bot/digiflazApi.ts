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

export async function getDigiflazPrice(sku: string): Promise<number> {
  const { username, apiKey } = getCreds();
  if (!username || !apiKey) return 0;
  try {
    const sign = md5(username + apiKey + "pricelist");
    const res = await axios.post(
      `${BASE_URL}/price-list`,
      { cmd: "prepaid", username, sign },
      { timeout: 15000 }
    );
    const list: any[] = Array.isArray(res.data?.data) ? res.data.data : [];
    const item = list.find((p: any) => p.buyer_sku_code === sku);
    const price = Number(item?.price ?? 0);
    logger.info({ sku, price }, "Fetched Digiflaz price");
    return price;
  } catch (err) {
    logger.error({ err, sku }, "Failed to fetch Digiflaz price list");
    return 0;
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
