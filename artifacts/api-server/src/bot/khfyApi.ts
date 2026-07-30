import axios from "axios";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

export type KhfyOrderResult =
  | { success: true; sn: string; message: string; reffId: string; trxid?: string }
  | { success: false; error: string; reffId: string };

export type KhfyBalanceResult = { balance: number; raw: string } | { balance: null; raw: string };

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
    } catch {
      // Try next
    }
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await axios.get(`${baseUrl}/history`, {
      params: { api_key: apiKey, start_date: today },
      timeout: 10000,
    });
    const data = res.data ?? {};
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    const rawLower = raw.toLowerCase();
    if (rawLower.includes("invalid") && rawLower.includes("key")) {
      return { balance: null, raw: "❌ API key tidak valid" };
    }
    return { balance: null, raw: `✅ Server merespons, saldo tidak tersedia via API` };
  } catch (e: any) {
    const errDetail = e?.response?.status
      ? `HTTP ${e.response.status}`
      : String(e?.message ?? e).slice(0, 60);
    return { balance: null, raw: `❌ Tidak terhubung: ${errDetail}` };
  }
}

/**
 * Cek status order KHFY menggunakan trxid via endpoint /history?trxid=...
 * status2: 1 = sukses, 72 = gagal, lainnya = pending
 */
export async function checkKhfyOrderStatus(trxid: string): Promise<KhfyStatusResult> {
  const apiKey = process.env.API2_KEY ?? "";
  const baseUrl = process.env.API2_BASE_URL ?? "";

  if (!apiKey || !baseUrl || !trxid) {
    logger.warn({ trxid }, "KHFY checkStatus: missing config or trxid");
    return { status: "unknown" };
  }

  try {
    const res = await axios.get(`${baseUrl}/history`, {
      params: { trxid, api_key: apiKey },
      timeout: 15000,
    });

    const data = res.data ?? {};
    logger.info({ data, trxid }, "KHFY /history status response");

    const items = Array.isArray(data.data) ? data.data : [];
    if (items.length === 0) {
      logger.warn({ trxid }, "KHFY /history: no data, anggap pending");
      return { status: "pending" };
    }

    const item = items[0];
    const status2 = Number(item.status2 ?? -1);
    const statusText = String(item.status_text ?? "").toLowerCase();
    const keterangan = String(item.keterangan ?? "");
    const sn = String(item.sn ?? "");


// Cek keterangan dulu — KHFY kadang return status sukses tapi keterangan menunjukkan gagal
const keteranganGagal =
  keteranganLower.includes("stock") ||
  keteranganLower.includes("stok") ||
  keteranganLower.includes("habis") ||
  keteranganLower.includes("kosong") ||
  keteranganLower.includes("gagal") ||
  keteranganLower.includes("failed") ||
  keteranganLower.includes("invalid") ||
  keteranganLower.includes("terdaftar");

if (keteranganGagal) {
  logger.warn({ trxid, keterangan, status2, statusText }, "KHFY: keterangan menunjukkan gagal");
  return { status: "failed", error: keterangan };
}

    // status2 = 1 → sukses
    if (status2 === 1 || statusText === "sukses" || statusText === "success" || statusText === "berhasil") {
      return { status: "success", sn };
    }

    // status2 = 72 atau GAGAL → gagal
    if (
      status2 === 72 || status2 === 0 ||
      statusText === "gagal" || statusText === "failed" || statusText === "fail" ||
      statusText === "error" || statusText === "cancel"
    ) {
      return { status: "failed", error: keterangan || statusText };
    }

    // Masih pending
    if (statusText === "pending" || statusText === "process" || statusText === "processing" || statusText === "") {
      return { status: "pending" };
    }

    logger.warn({ item, trxid }, "KHFY /history: status tidak dikenali, anggap pending");
    return { status: "pending" };

  } catch (err: any) {
    logger.error({ err: err?.response?.data ?? err?.message, trxid }, "KHFY /history error");
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

    // Ambil trxid dari response untuk polling
    const trxid = String(data.data?.trxid ?? data.trxid ?? "");

    const status = String(data.status ?? "").toLowerCase();
    const msg = String(data.message ?? data.msg ?? data.pesan ?? "").toLowerCase();

    // Langsung gagal
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

    const ok =
      data.ok === true ||
      status === "sukses" || status === "success" || status === "berhasil" ||
      status === "1" || status === "pending" || status === "process" ||
      status === "processing" || status === "antri" || status === "" ||
      (data.msg && String(data.msg).toLowerCase().includes("proses"));

    if (ok) {
      return {
        success: true,
        sn: String(data.sn ?? data.serial ?? data.no_seri ?? ""),
        message: String(data.msg ?? data.message ?? data.pesan ?? "Order diterima, sedang diproses."),
        reffId,
        trxid, // ← untuk polling via /history?trxid=
      };
    }

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
