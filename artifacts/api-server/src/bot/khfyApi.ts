import axios from "axios";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

export type KhfyOrderResult =
  | { success: true; sn: string; message: string; reffId: string }
  | { success: false; error: string; reffId: string };

export type KhfyBalanceResult = { balance: number; raw: string } | { balance: null; raw: string };

export async function getKhfyBalance(): Promise<KhfyBalanceResult> {
  const apiKey = process.env.API2_KEY ?? "";
  const baseUrl = process.env.API2_BASE_URL ?? "";
  if (!apiKey || !baseUrl) return { balance: null, raw: "Env API2_KEY / API2_BASE_URL tidak tersedia" };

  const endpoints = [
    { url: `${baseUrl}/saldo`, params: { api_key: apiKey } },
    { url: `${baseUrl}/balance`, params: { api_key: apiKey } },
    { url: `${baseUrl}/profile`, params: { api_key: apiKey } },
    { url: `${baseUrl}/member`, params: { api_key: apiKey } },
    { url: `${baseUrl}/cek-saldo`, params: { api_key: apiKey } },
  ];

  let lastRaw = "";
  for (const ep of endpoints) {
    try {
      const res = await axios.get(ep.url, { params: ep.params, timeout: 8000 });
      const data = res.data ?? {};
      const raw = typeof data === "string" ? data : JSON.stringify(data);
      lastRaw = raw.slice(0, 100);

      if (typeof data === "object" && data !== null) {
        const val = data.saldo ?? data.balance ?? data.kredit ?? data.credit ?? data.deposit ?? data.wallet
          ?? data.data?.saldo ?? data.data?.balance ?? data.data?.kredit;
        if (val !== undefined && !isNaN(Number(String(val).replace(/\./g, "").replace(/,/g, "")))) {
          return { balance: Number(String(val).replace(/\./g, "").replace(/,/g, "")), raw };
        }
      }
      if (typeof data === "string") {
        const matchNum = data.match(/\b([0-9]{3,}(?:[.,][0-9]+)*)\b/);
        if (matchNum) {
          return { balance: Number(matchNum[1].replace(/\./g, "").replace(/,/g, "")), raw };
        }
      }
    } catch {
      // Try next endpoint
    }
  }

  // Fallback: test connectivity via /trx with dummy data — if KHFY replies
  // with anything (even "nomor tidak valid"), it means the server is reachable and auth works.
  try {
    const res = await axios.get(`${baseUrl}/trx`, {
      params: { produk: "PING_TEST", tujuan: "00000000000", reff_id: "ping-check", api_key: apiKey },
      timeout: 10000,
    });
    const data = res.data ?? {};
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    // If we got any structured response, server is up and auth is accepted
    const status = String(data.status ?? data.ok ?? "").toLowerCase();
    const msg = String(data.message ?? data.msg ?? data.pesan ?? data.error ?? raw).slice(0, 80);
    logger.info({ raw: raw.slice(0, 100) }, "KHFY /trx ping response");
    return { balance: null, raw: `✅ Server merespons (no saldo endpoint). Msg: ${msg}` };
  } catch (e: any) {
    const errDetail = e?.response?.data
      ? String(e.response.data).slice(0, 80)
      : String(e?.message ?? e).slice(0, 80);
    logger.warn({ lastRaw, err: errDetail }, "KHFY: all endpoints failed");
    return { balance: null, raw: `❌ Tidak terhubung: ${errDetail}` };
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
