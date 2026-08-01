import { query, run } from "../lib/db";
import { logger } from "../lib/logger";

export type PreOrderStatus = "pending" | "processing" | "done" | "cancelled" | "refunded";
export type PreOrderPaymentMethod = "saldo" | "qris";

export type PreOrder = {
  id: string;
  userId: number;
  userName: string;
  sku: string;
  packageName: string;
  nomorTujuan: string;
  price: number;
  paymentMethod: PreOrderPaymentMethod;
  status: PreOrderStatus;
  reffId?: string;
  sn?: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
};

const preOrders: PreOrder[] = [];

function rowToPreOrder(row: any): PreOrder {
  return {
    id: row.id,
    userId: Number(row.user_id),
    userName: row.user_name,
    sku: row.sku,
    packageName: row.package_name,
    nomorTujuan: row.nomor_tujuan,
    price: Number(row.price),
    paymentMethod: row.payment_method as PreOrderPaymentMethod,
    status: row.status as PreOrderStatus,
    reffId: row.reff_id ?? undefined,
    sn: row.sn ?? undefined,
    note: row.note ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function loadPreOrdersFromDb(): Promise<void> {
  try {
    const rows = await query("SELECT * FROM pre_orders ORDER BY created_at DESC");
    preOrders.length = 0;
    for (const row of rows) preOrders.push(rowToPreOrder(row));
    logger.info({ count: preOrders.length }, "Loaded pre_orders from DB");
  } catch (err) {
    logger.error({ err }, "Failed to load pre_orders from DB");
  }
}

export function createPreOrder(data: {
  userId: number;
  userName: string;
  sku: string;
  packageName: string;
  nomorTujuan: string;
  price: number;
  paymentMethod: PreOrderPaymentMethod;
}): PreOrder {
  const po: PreOrder = {
    ...data,
    id: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  preOrders.unshift(po);
  run(
    `INSERT INTO pre_orders
      (id, user_id, user_name, sku, package_name, nomor_tujuan, price, payment_method, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [po.id, po.userId, po.userName, po.sku, po.packageName, po.nomorTujuan,
     po.price, po.paymentMethod, po.status, po.createdAt, po.updatedAt]
  ).catch((e) => logger.error({ e }, "DB insert pre_order failed"));
  return po;
}

export function getPendingPreOrders(): PreOrder[] {
  return preOrders.filter((p) => p.status === "pending");
}

export function getAllPreOrders(): PreOrder[] {
  return [...preOrders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function getPreOrderById(id: string): PreOrder | undefined {
  return preOrders.find((p) => p.id === id);
}

export function getPreOrdersByUser(userId: number): PreOrder[] {
  return preOrders.filter((p) => p.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function hasActivePendingPreOrder(nomorTujuan: string, sku: string): boolean {
  return preOrders.some(
    (p) => p.nomorTujuan === nomorTujuan && p.sku === sku &&
      (p.status === "pending" || p.status === "processing")
  );
}

export function updatePreOrderStatus(
  id: string,
  status: PreOrderStatus,
  extra?: { reffId?: string; sn?: string; note?: string }
): PreOrder | null {
  const po = preOrders.find((p) => p.id === id);
  if (!po) return null;
  po.status = status;
  po.updatedAt = new Date();
  if (extra?.reffId) po.reffId = extra.reffId;
  if (extra?.sn) po.sn = extra.sn;
  if (extra?.note) po.note = extra.note;

  run(
    `UPDATE pre_orders SET status=$1, updated_at=$2,
     reff_id=COALESCE($3, reff_id), sn=COALESCE($4, sn), note=COALESCE($5, note)
     WHERE id=$6`,
    [status, po.updatedAt, extra?.reffId ?? null, extra?.sn ?? null, extra?.note ?? null, id]
  ).catch((e) => logger.error({ e }, "DB update pre_order failed"));
  return po;
}
