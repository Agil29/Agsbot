import { query, run } from "../lib/db";
import { logger } from "../lib/logger";

export type OrderStatus = "pending" | "paid" | "processing" | "done" | "cancelled";

export type Order = {
  id: string;
  userId: number;
  userName: string;
  userUsername?: string;
  category: string;
  packageId: string;
  packageName: string;
  price: number;
  baseprice: number;
  quota: string;
  validity: string;
  nomorTujuan?: string;
  sn?: string;
  reffId?: string;
  paymentMethod?: "saldo" | "qris";
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
};

const orders: Order[] = [];

function rowToOrder(row: any): Order {
  return {
    id: row.id,
    userId: Number(row.user_id),
    userName: row.user_name,
    userUsername: row.user_username ?? undefined,
    category: row.category,
    packageId: row.package_id,
    packageName: row.package_name,
    price: Number(row.price),
    baseprice: Number(row.baseprice ?? row.price),
    quota: row.quota,
    validity: row.validity,
    nomorTujuan: row.nomor_tujuan ?? undefined,
    sn: row.sn ?? undefined,
    reffId: row.reff_id ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    status: row.status as OrderStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function loadOrdersFromDb(): Promise<void> {
  try {
    const rows = await query("SELECT * FROM orders ORDER BY created_at DESC");
    orders.length = 0;
    for (const row of rows) orders.push(rowToOrder(row));
    logger.info({ count: orders.length }, "Loaded orders from DB");
  } catch (err) {
    logger.error({ err }, "Failed to load orders from DB");
  }
}

export function createOrder(data: Omit<Order, "id" | "status" | "createdAt" | "updatedAt">): Order {
  const order: Order = {
    ...data,
    id: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  orders.unshift(order);

  run(
    `INSERT INTO orders (id, user_id, user_name, user_username, category, package_id, package_name, price, baseprice, quota, validity,
      nomor_tujuan, sn, reff_id, payment_method, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      order.id, order.userId, order.userName, order.userUsername ?? null,
      order.category, order.packageId, order.packageName,
      order.price, order.baseprice, order.quota, order.validity,
      order.nomorTujuan ?? null, order.sn ?? null, order.reffId ?? null,
      order.paymentMethod ?? null, order.status, order.createdAt, order.updatedAt,
    ]
  ).catch((err) => logger.error({ err }, "DB insert order failed"));

  return order;
}

export function getOrdersByUser(userId: number): Order[] {
  return orders
    .filter((o) => o.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function getAllOrders(): Order[] {
  return [...orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function getOrderByReffId(reffId: string): Order | undefined {
  return orders.find((o) => o.reffId === reffId);
}

/** Lookup by DOPU's own trxID (stored as sn field after initial response) */
export function getOrderByDopuTrxId(trxId: string): Order | undefined {
  if (!trxId) return undefined;
  return orders.find((o) => o.sn === trxId && (o.status === "processing" || o.status === "paid" || o.status === "pending"));
}

export function updateOrderStatus(orderId: string, status: OrderStatus, sn?: string): Order | null {
  const order = orders.find((o) => o.id === orderId);
  if (!order) return null;
  order.status = status;
  order.updatedAt = new Date();
  if (sn !== undefined) order.sn = sn;

  run(
    "UPDATE orders SET status=$1, updated_at=$2, sn=COALESCE($3, sn) WHERE id=$4",
    [status, order.updatedAt, sn ?? null, orderId]
  ).catch((err) => logger.error({ err }, "DB update order status failed"));

  return order;
}

export function getOrderById(orderId: string): Order | undefined {
  return orders.find((o) => o.id === orderId);
}

export function formatOrderDate(date: Date): string {
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const statusLabel: Record<OrderStatus, string> = {
  pending: "⏳ Menunggu Pembayaran",
  paid: "✅ Pembayaran Diterima",
  processing: "⚙️ Sedang Diproses",
  done: "🎉 Selesai",
  cancelled: "❌ Dibatalkan",
};
