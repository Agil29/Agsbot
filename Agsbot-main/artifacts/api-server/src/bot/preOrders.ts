import { query, run } from "../lib/db";
import { logger } from "../lib/logger";

export type PreOrderStatus = "pending" | "processing" | "done" | "cancelled";

export type PreOrder = {
  id: string;
  userId: number;
  userName: string;
  userUsername?: string;
  packageId: string;
  packageName: string;
  sku: string;
  price: number;
  baseprice: number;
  nomorTujuan: string;
  paymentMethod: "saldo" | "qris";
  status: PreOrderStatus;
  note?: string;           // alasan cancel dari admin
  reffId?: string;         // diisi saat order dikirim ke KHFY
  sn?: string;             // diisi saat sukses
  createdAt: Date;
  updatedAt: Date;
};

const preOrders: PreOrder[] = [];

function rowToPreOrder(row: any): PreOrder {
  return {
    id: row.id,
    userId: Number(row.user_id),
    userName: row.user_name,
    userUsername: row.user_username ?? undefined,
    packageId: row.package_id,
    packageName: row.package_name,
    sku: row.sku,
    price: Number(row.price),
    baseprice: Number(row.baseprice ?? row.price),
    nomorTujuan: row.nomor_tujuan,
    paymentMethod: row.payment_method as "saldo" | "qris",
    status: row.status as PreOrderStatus,
    note: row.note ?? undefined,
    reffId: row.reff_id ?? undefined,
    sn: row.sn ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function loadPreOrdersFromDb(): Promise<void> {
  try {
    await run(`
      CREATE TABLE IF NOT EXISTS pre_orders (
        id             TEXT PRIMARY KEY,
        user_id        BIGINT NOT NULL,
        user_name      TEXT NOT NULL,
        user_username  VARCHAR(100),
        package_id     TEXT NOT NULL,
        package_name   TEXT NOT NULL,
        sku            TEXT NOT NULL,
        price          BIGINT NOT NULL DEFAULT 0,
        baseprice      NUMERIC NOT NULL DEFAULT 0,
        nomor_tujuan   TEXT NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'saldo',
        status         TEXT NOT NULL DEFAULT 'pending',
        note           TEXT,
        reff_id        TEXT,
        sn             TEXT,
        created_at     TIMESTAMPTZ DEFAULT now(),
        updated_at     TIMESTAMPTZ DEFAULT now()
      )
    `);

    // safe migrations
    await run("ALTER TABLE pre_orders ADD COLUMN IF NOT EXISTS note TEXT").catch(() => {});
    await run("ALTER TABLE pre_orders ADD COLUMN IF NOT EXISTS reff_id TEXT").catch(() => {});
    await run("ALTER TABLE pre_orders ADD COLUMN IF NOT EXISTS sn TEXT").catch(() => {});

    const rows = await query("SELECT * FROM pre_orders ORDER BY created_at DESC");
    preOrders.length = 0;
    for (const row of rows) preOrders.push(rowToPreOrder(row));
    logger.info({ count: preOrders.length }, "Loaded pre_orders from DB");
  } catch (err) {
    logger.error({ err }, "Failed to load pre_orders from DB");
  }
}

export function createPreOrder(data: Omit<PreOrder, "id" | "status" | "createdAt" | "updatedAt">): PreOrder {
  const po: PreOrder = {
    ...data,
    id: `PRE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  preOrders.unshift(po);

  run(
    `INSERT INTO pre_orders
       (id, user_id, user_name, user_username, package_id, package_name, sku, price, baseprice,
        nomor_tujuan, payment_method, status, note, reff_id, sn, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      po.id, po.userId, po.userName, po.userUsername ?? null,
      po.packageId, po.packageName, po.sku, po.price, po.baseprice,
      po.nomorTujuan, po.paymentMethod, po.status,
      po.note ?? null, po.reffId ?? null, po.sn ?? null,
      po.createdAt, po.updatedAt,
    ]
  ).catch((err) => logger.error({ err }, "DB insert pre_order failed"));

  return po;
}

export function getAllPreOrders(): PreOrder[] {
  return [...preOrders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function getPreOrdersByUser(userId: number): PreOrder[] {
  return preOrders
    .filter((p) => p.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function getPendingPreOrders(): PreOrder[] {
  return preOrders.filter((p) => p.status === "pending");
}

export function getPreOrderById(id: string): PreOrder | undefined {
  return preOrders.find((p) => p.id === id);
}

export function updatePreOrderStatus(
  id: string,
  status: PreOrderStatus,
  extra?: { note?: string; reffId?: string; sn?: string }
): PreOrder | null {
  const po = preOrders.find((p) => p.id === id);
  if (!po) return null;
  po.status = status;
  po.updatedAt = new Date();
  if (extra?.note !== undefined) po.note = extra.note;
  if (extra?.reffId !== undefined) po.reffId = extra.reffId;
  if (extra?.sn !== undefined) po.sn = extra.sn;

  run(
    `UPDATE pre_orders
     SET status=$1, updated_at=$2,
         note=COALESCE($3, note),
         reff_id=COALESCE($4, reff_id),
         sn=COALESCE($5, sn)
     WHERE id=$6`,
    [status, po.updatedAt, extra?.note ?? null, extra?.reffId ?? null, extra?.sn ?? null, id]
  ).catch((err) => logger.error({ err }, "DB update pre_order status failed"));

  return po;
}

/** Cek apakah nomor ini sudah punya pre order aktif (pending/processing) untuk SKU yg sama */
export function hasActivePendingPreOrder(nomor: string, sku: string): boolean {
  return preOrders.some(
    (p) =>
      p.nomorTujuan === nomor &&
      p.sku === sku &&
      (p.status === "pending" || p.status === "processing")
  );
}
