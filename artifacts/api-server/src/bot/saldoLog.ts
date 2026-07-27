import { run, query } from "../lib/db";
import { logger } from "../lib/logger";

export type SaldoLogType =
  | "topup"          // QRIS topup masuk
  | "order_deduct"   // Saldo dikurangi saat order
  | "order_refund"   // Saldo dikembalikan karena order gagal
  | "admin_credit"   // Admin tambah saldo
  | "admin_deduct"   // Admin kurangi saldo
  | "admin_set";     // Admin set saldo langsung

export type SaldoLogEntry = {
  id: number;
  telegramId: number;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  type: SaldoLogType;
  refId?: string;
  note?: string;
  createdAt: Date;
};

export async function logSaldo(params: {
  telegramId: number;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  type: SaldoLogType;
  refId?: string;
  note?: string;
}): Promise<void> {
  run(
    `INSERT INTO saldo_logs
      (telegram_id, delta, balance_before, balance_after, type, ref_id, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      params.telegramId,
      params.delta,
      params.balanceBefore,
      params.balanceAfter,
      params.type,
      params.refId ?? null,
      params.note ?? null,
    ]
  ).catch((err) => logger.error({ err }, "Failed to write saldo log"));
}

export async function getSaldoLogs(telegramId: number, limit = 50): Promise<SaldoLogEntry[]> {
  const rows = await query<any>(
    `SELECT * FROM saldo_logs WHERE telegram_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [telegramId, limit]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    telegramId: Number(r.telegram_id),
    delta: Number(r.delta),
    balanceBefore: Number(r.balance_before),
    balanceAfter: Number(r.balance_after),
    type: r.type as SaldoLogType,
    refId: r.ref_id ?? undefined,
    note: r.note ?? undefined,
    createdAt: new Date(r.created_at),
  }));
}

export async function getAllSaldoLogs(limit = 200): Promise<SaldoLogEntry[]> {
  const rows = await query<any>(
    `SELECT * FROM saldo_logs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    telegramId: Number(r.telegram_id),
    delta: Number(r.delta),
    balanceBefore: Number(r.balance_before),
    balanceAfter: Number(r.balance_after),
    type: r.type as SaldoLogType,
    refId: r.ref_id ?? undefined,
    note: r.note ?? undefined,
    createdAt: new Date(r.created_at),
  }));
}
