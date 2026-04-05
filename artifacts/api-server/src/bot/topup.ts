import axios from "axios";
import { logger } from "../lib/logger";

export type TopupStatus = "pending" | "confirming" | "completed" | "expired" | "cancelled";

export type TopupOrder = {
  id: string;
  userId: number;
  chatId: number;
  userName: string;
  nominal: number;
  fee: number;
  total: number;
  qrisString?: string;
  status: TopupStatus;
  createdAt: Date;
  expiresAt: Date;
};

const topups = new Map<string, TopupOrder>();

const PAKASIR_BASE = "https://app.pakasir.com/api";
const EXPIRY_MINUTES = 7;

export async function createPakasirTopup(data: {
  userId: number;
  chatId: number;
  userName: string;
  nominal: number;
}): Promise<{ order: TopupOrder; qrisString: string } | { error: string }> {
  const apiKey = process.env.PAKASIR_API_KEY ?? "";
  const project = process.env.PAKASIR_SLUG ?? "";

  if (!apiKey || !project) {
    return { error: "Pakasir belum dikonfigurasi. Hubungi admin." };
  }

  const orderId = `TOPUP${Date.now()}${data.userId}`;

  try {
    const res = await axios.post(
      `${PAKASIR_BASE}/transactioncreate/qris`,
      { project, order_id: orderId, amount: data.nominal, api_key: apiKey },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );

    const payment = res.data?.payment;
    if (!payment || !payment.payment_number) {
      logger.error({ data: res.data }, "Pakasir: unexpected response");
      return { error: "Gagal mendapatkan QRIS dari Pakasir. Coba lagi." };
    }

    const now = new Date();
    const order: TopupOrder = {
      id: orderId,
      userId: data.userId,
      chatId: data.chatId,
      userName: data.userName,
      nominal: data.nominal,
      fee: payment.fee ?? 0,
      total: payment.total_payment ?? data.nominal,
      qrisString: payment.payment_number,
      status: "pending",
      createdAt: now,
      expiresAt: new Date(now.getTime() + EXPIRY_MINUTES * 60 * 1000),
    };

    topups.set(orderId, order);
    return { order, qrisString: payment.payment_number };
  } catch (err: any) {
    logger.error({ err: err?.response?.data ?? err }, "Pakasir API error");
    const msg = err?.response?.data?.message ?? err?.message ?? "Error";
    return { error: `Gagal membuat transaksi: ${msg}` };
  }
}

export async function checkPakasirStatus(orderId: string): Promise<string | null> {
  const apiKey = process.env.PAKASIR_API_KEY ?? "";
  const project = process.env.PAKASIR_SLUG ?? "";
  const order = topups.get(orderId);
  if (!order) return null;

  try {
    const res = await axios.get(`${PAKASIR_BASE}/transactiondetail`, {
      params: { project, order_id: orderId, amount: order.nominal, api_key: apiKey },
      timeout: 10000,
    });
    return res.data?.transaction?.status ?? null;
  } catch (err) {
    logger.error({ err }, "Failed to check Pakasir status");
    return null;
  }
}

export async function cancelPakasirTransaction(orderId: string): Promise<boolean> {
  const apiKey = process.env.PAKASIR_API_KEY ?? "";
  const project = process.env.PAKASIR_SLUG ?? "";
  const order = topups.get(orderId);
  if (!order) return false;

  try {
    await axios.post(
      `${PAKASIR_BASE}/transactioncancel`,
      { project, order_id: orderId, amount: order.nominal, api_key: apiKey },
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );
    order.status = "cancelled";
    return true;
  } catch {
    return false;
  }
}

export function getTopupById(id: string): TopupOrder | undefined {
  return topups.get(id);
}

export function updateTopupStatus(id: string, status: TopupStatus): TopupOrder | null {
  const t = topups.get(id);
  if (!t) return null;
  t.status = status;
  return t;
}

export function getAllTopups(): TopupOrder[] {
  return Array.from(topups.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function calculateFee(nominal: number): { fee: number; total: number } {
  let fee: number;
  if (nominal <= 105000) {
    fee = Math.ceil(nominal * 0.007 + 310);
  } else {
    fee = Math.ceil(nominal * 0.01);
  }
  return { fee, total: nominal + fee };
}
