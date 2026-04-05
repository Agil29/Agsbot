import axios from "axios";
import { logger } from "../lib/logger";
import { query, run } from "../lib/db";

export type TopupStatus = "pending" | "confirming" | "completed" | "expired" | "cancelled";

export type OrderPayload = {
  sku: string;
  nomorTujuan: string;
  packageName: string;
  category: string;
  packageId: string;
  quota: string;
  validity: string;
};

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
  orderPayload?: OrderPayload;
};

const topups = new Map<string, TopupOrder>();

const PAKASIR_BASE = "https://app.pakasir.com/api";
const EXPIRY_MINUTES = 7;

function rowToTopup(row: any): TopupOrder {
  return {
    id: row.id,
    userId: Number(row.user_id),
    chatId: Number(row.chat_id),
    userName: row.user_name,
    nominal: Number(row.nominal),
    fee: Number(row.fee),
    total: Number(row.total),
    qrisString: row.qris_string ?? undefined,
    status: row.status as TopupStatus,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    orderPayload: row.order_payload ?? undefined,
  };
}

export async function loadTopupsFromDb(): Promise<void> {
  try {
    const rows = await query("SELECT * FROM topups ORDER BY created_at DESC LIMIT 1000");
    topups.clear();
    for (const row of rows) {
      const t = rowToTopup(row);
      topups.set(t.id, t);
    }
    logger.info({ count: topups.size }, "Loaded topups from DB");
  } catch (err) {
    logger.error({ err }, "Failed to load topups from DB");
  }
}

export async function createPakasirTopup(data: {
  userId: number;
  chatId: number;
  userName: string;
  nominal: number;
  orderPayload?: OrderPayload;
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
      orderPayload: data.orderPayload,
    };

    topups.set(orderId, order);

    run(
      `INSERT INTO topups (id, user_id, chat_id, user_name, nominal, fee, total, qris_string,
        status, created_at, expires_at, order_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        order.id, order.userId, order.chatId, order.userName, order.nominal, order.fee, order.total,
        order.qrisString ?? null, order.status, order.createdAt, order.expiresAt,
        order.orderPayload ? JSON.stringify(order.orderPayload) : null,
      ]
    ).catch((err) => logger.error({ err }, "DB insert topup failed"));

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

  const body = { project, order_id: orderId, amount: order.nominal, api_key: apiKey };

  // Try POST first (same pattern as transactioncreate)
  try {
    const res = await axios.post(`${PAKASIR_BASE}/transactiondetail`, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });
    logger.info({ orderId, data: res.data }, "Pakasir transactiondetail POST response");
    const status =
      res.data?.transaction?.status ??
      res.data?.data?.status ??
      res.data?.status ??
      null;
    if (status) return String(status);
  } catch (err: any) {
    logger.warn({ orderId, status: err?.response?.status, data: err?.response?.data }, "Pakasir transactiondetail POST failed, trying GET");
  }

  // Fallback: GET with query params + amount
  try {
    const res = await axios.get(`${PAKASIR_BASE}/transactiondetail`, {
      params: body,
      timeout: 10000,
    });
    logger.info({ orderId, data: res.data }, "Pakasir transactiondetail GET response");
    const status =
      res.data?.transaction?.status ??
      res.data?.data?.status ??
      res.data?.status ??
      null;
    return status ? String(status) : null;
  } catch (err: any) {
    logger.error({ orderId, status: err?.response?.status, data: err?.response?.data }, "Pakasir transactiondetail GET also failed");
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
    run("UPDATE topups SET status='cancelled' WHERE id=$1", [orderId]).catch((err) =>
      logger.error({ err }, "DB update topup cancel failed")
    );
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

  run("UPDATE topups SET status=$1 WHERE id=$2", [status, id]).catch((err) =>
    logger.error({ err }, "DB update topup status failed")
  );

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
