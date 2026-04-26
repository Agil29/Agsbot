import axios from "axios";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

export type KhfyOrderResult =
  | { success: true; sn: string; message: string; reffId: string }
  | { success: false; error: string; reffId: string };

export type KhfyBalanceResult = { balance: number; raw: string } | { balance: null; raw: string };

// Status hasil polling
export type KhfyStatusResult =
  | { status: "success"; sn: string }
  | { status: "failed"; error: string }
  | { status: "pending" }
  | { status: "unknown" };

function parseBalanceFromData(data: unknown): number | null {
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    const val = d.saldo ?? d.balance ?? d.kredit ?? d.credit ?? d.deposit ?? d.wallet
      ?? (d.data as any)?.saldo ?? (d.data as any)?.balance ?? (d.data as any)?.kredit;
    if (val !== undefined) {
      const n = Number(String(val).replace(/\./g, "").replace(/,/g, ""));
      return isNaN(n) ? null : n;
    }
  }
  if (typeof data === "string") {
    const matchSaldo = data.match(/saldo[^0-9]*([0-9][0-9.,]*)/i);
    if (matchSaldo) return Number(matchSaldo[1].replace(/\./g, "").replace(/,/g, ""));
    const matchNum = data.match(/\b([0-9]{4,})\b/);
    if (matchNum) return Number(matchNum[1]);
  }
  return null;
}

export async function getKhfyBalance(): Promise<KhfyBalanceResult> {
  const apiKey = process.env.API2_KEY ?? "";
  const baseUrl = process.env.API2_BASE_URL ?? "";
  if (!apiKey || !baseUrl) return { balance: null, raw: "Env API2_KEY / API2_BASE_URL tidak tersedia" };

  const balEndpoints = [
    `${baseUrl}/saldo`,
    `${baseUrl}/balance`,
    `${baseUrl}/profile`,
  ];

  for (const url of balEndpoints) {
    try {
      const res = await axios.get(url, { params: { api_key: apiKey }, timeout: 8000 });
      const data = res.data ?? {};
      const raw = typeof data === "string" ? data : JSON.stringify(data);
      const bal = parseBalanceFromData(data);
      if (bal !== null) return { balance: bal, raw };
      logger.info({ url, raw: raw.slice(0, 80) }, "KHFY balance endpoint: no parseable saldo");
    } catch {
      // Try next
    }
  }

  try {
    const res = await axios.get(`${baseUrl}/history`, {
      params: { api_key: apiKey, refid: "connectivity-check" },
      timeout: 10000,
    });
    const data = res.data ?? {};
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    const rawLower = raw.toLowerCase();
    if (rawLower.includes("invalid") && rawLower.includes("key")) {
      logger.warn({ raw: raw.slice(0, 80) }, "KHFY /history: invalid API key");
      return { balance: null, raw: "❌ API key tidak valid" };
    }
    logger.info({ raw: raw.slice(0, 80) }, "KHFY /history ping response");
    return { balance: null, raw: `✅ Server merespons, saldo tidak tersedia via API` };
  } catch (e: any) {
    const errDetail = e?.response?.status
      ? `HTTP ${e.response.status}`
      : String(e?.message ?? e).slice(0, 60);
    logger.warn({ err: errDetail }, "KHFY: all endpoints failed");
    return { balance: null, raw: `❌ Tidak terhubung: ${errDetail}` };
  }
}

/**
 * Cek status order KHFY menggunakan reff_id.
 * Digunakan oleh orderPoller untuk polling setelah order ditempatkan.
 */
export async function checkKhfyOrderStatus(reffId: string): Promise<KhfyStatusResult> {
  const apiKey = process.env.API2_KEY ?? "";
  const baseUrl = process.env.API2_BASE_URL ?? "";

  if (!apiKey || !baseUrl) {
    return { status: "unknown" };
  }

  try {
    const res = await axios.get(`${baseUrl}/status`, {
      params: { reff_id: reffId, api_key: apiKey },
      timeout: 15000,
    });

    const data = res.data ?? {};
    logger.info({ data, reffId }, "KHFY /status response");

    const status = String(data.status ?? "").toLowerCase();
    const msg = String(data.message ?? data.msg ?? data.pesan ?? "").toLowerCase();

    // Sukses
    if (
      data.ok === true ||
      status === "sukses" || status === "success" || status === "berhasil" ||
      status === "1" || status === "complete" || status === "completed"
    ) {
      return {
        status: "success",
        sn: String(data.sn ?? data.serial ?? data.no_seri ?? ""),
      };
    }

    // Gagal
    if (
      status === "gagal" || status === "failed" || status === "fail" ||
      status === "error" || status === "0" || status === "cancel" ||
      msg.includes("stok") || msg.includes("kosong") || msg.includes("habis") ||
      msg.includes("gagal") || msg.includes("failed") || msg.includes("terdaftar")
    ) {
      const rawErr = String(data.message ?? data.msg ?? data.pesan ?? data.error ?? "gagal");
      return { status: "failed", error: rawErr };
    }

    // Masih pending/processing
    if (
      status === "pending" || status === "process" || status === "processing" ||
      status === "antri" || status === "waiting" || status === "" ||
      msg.includes("proses") || msg.includes("diproses") || msg.includes("pending")
    ) {
      return { status: "pending" };
    }

    logger.warn({ data, reffId }, "KHFY /status: status tidak dikenali, anggap pending");
    return { status: "pending" };
  } catch (err: any) {
    logger.error({ err: err?.response?.data ?? err?.message, reffId }, "KHFY /status error");
    return { status: "unknown" };
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
    const msg = String(data.message ?? data.msg ?? data.pesan ?? "").toLowerCase();

    // Langsung gagal — jangan lanjut polling
    const isFailed =
      status === "gagal" || status === "failed" || status === "fail" ||
      status === "error" || status === "0" || status === "cancel" ||
      msg.includes("stok") || msg.includes("kosong") || msg.includes("habis") ||
      msg.includes("terdaftar") || msg.includes("invalid");

    if (isFailed) {
      const rawError = String(data.message ?? data.msg ?? data.pesan ?? data.error ?? "");
      let errorMsg = "Order gagal. Hubungi admin.";
      if (rawError) {
        const upper = rawError.toUpperCase();
        if (upper.includes("KOSONG") || upper.includes("STOK") || upper.includes("HABIS")) {
          errorMsg = "Stok sedang kosong. Coba lagi nanti.";
        } else if (upper.includes("NOMOR") || upper.includes("TUJUAN")) {
          errorMsg = "Nomor tujuan tidak valid.";
        } else if (upper.includes("TERDAFTAR")) {
          errorMsg = rawError.slice(0, 120);
        } else {
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
    }

    // Sukses langsung (rare) atau pending — keduanya dianggap "accepted"
    // Bot akan polling untuk konfirmasi final via checkKhfyOrderStatus
    const ok =
      data.ok === true ||
      status === "sukses" || status === "success" || status === "berhasil" ||
      status === "1" || status === "pending" || status === "process" ||
      status === "processing" || status === "antri" || status === "";

    if (ok) {
      return {
        success: true,
        sn: String(data.sn ?? data.serial ?? data.no_seri ?? ""),
        message: String(data.message ?? data.msg ?? data.pesan ?? "Order diterima, sedang diproses."),
        reffId,
      };
    }

    // Fallback gagal
    const rawError = String(data.message ?? data.msg ?? data.pesan ?? data.error ?? "");
    return {
      success: false,
      error: rawError.slice(0, 120) || "Order gagal. Hubungi admin.",
      reffId,
    };
  } catch (err: any) {
    logger.error({ err: err?.response?.data ?? err?.message }, "KHFY /trx error");
    const msg = err?.response?.data?.message ?? err?.message ?? "Gagal terhubung ke server. Coba lagi.";
    return { success: false, error: msg, reffId };
  }
}
