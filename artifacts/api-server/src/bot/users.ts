import { query, run } from "../lib/db";
import { logger } from "../lib/logger";
import { logSaldo, type SaldoLogType } from "./saldoLog";

// Per-user async lock — prevents two simultaneous operations on the same user
const userLocks = new Map<number, Promise<void>>();

export async function withUserLock<T>(telegramId: number, fn: () => Promise<T>): Promise<T> {
  const prev = userLocks.get(telegramId) ?? Promise.resolve();
  let releaseLock!: () => void;
  const next = new Promise<void>((res) => { releaseLock = res; });
  userLocks.set(telegramId, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    releaseLock();
    // Clean up map entry if no other waiter
    if (userLocks.get(telegramId) === next) userLocks.delete(telegramId);
  }
}

export type UserProfile = {
  telegramId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  whatsapp?: string;
  uid: number;
  regDate: Date;
  saldo: number;
};

const users = new Map<number, UserProfile>();
let uidCounter = 1000;

function rowToUser(row: any): UserProfile {
  return {
    telegramId: Number(row.telegram_id),
    firstName: row.first_name,
    lastName: row.last_name ?? undefined,
    username: row.username ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    uid: Number(row.uid),
    regDate: new Date(row.reg_date),
    saldo: Number(row.saldo),
  };
}

export async function loadUsersFromDb(): Promise<void> {
  try {
    const rows = await query("SELECT * FROM users");
    users.clear();
    let maxUid = 1000;
    for (const row of rows) {
      const u = rowToUser(row);
      users.set(u.telegramId, u);
      if (u.uid > maxUid) maxUid = u.uid;
    }
    uidCounter = maxUid;
    logger.info({ count: users.size }, "Loaded users from DB");
  } catch (err) {
    logger.error({ err }, "Failed to load users from DB");
  }
}

export function getOrRegisterUser(
  telegramId: number,
  firstName: string,
  lastName?: string,
  username?: string
): UserProfile {
  if (users.has(telegramId)) {
    const user = users.get(telegramId)!;
    const changed =
      user.firstName !== firstName ||
      user.lastName !== lastName ||
      user.username !== username;
    user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (username !== undefined) user.username = username;
    if (changed) {
      run(
        "UPDATE users SET first_name=$1, last_name=$2, username=$3 WHERE telegram_id=$4",
        [firstName, lastName ?? null, username ?? null, telegramId]
      ).catch((err) => logger.error({ err }, "DB update user profile failed"));
    }
    return user;
  }

  uidCounter += Math.floor(Math.random() * 50) + 1;
  const newUser: UserProfile = {
    telegramId,
    firstName,
    lastName,
    username,
    uid: uidCounter,
    regDate: new Date(),
    saldo: 0,
  };
  users.set(telegramId, newUser);

  run(
    `INSERT INTO users (telegram_id, first_name, last_name, username, uid, reg_date, saldo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (telegram_id) DO NOTHING`,
    [telegramId, firstName, lastName ?? null, username ?? null, newUser.uid, newUser.regDate, 0]
  ).catch((err) => logger.error({ err }, "DB insert user failed"));

  return newUser;
}

export function getUser(telegramId: number): UserProfile | undefined {
  return users.get(telegramId);
}

export function setWhatsapp(telegramId: number, whatsapp: string): UserProfile | null {
  const user = users.get(telegramId);
  if (!user) return null;
  user.whatsapp = whatsapp;
  run("UPDATE users SET whatsapp=$1 WHERE telegram_id=$2", [whatsapp, telegramId]).catch(
    (err) => logger.error({ err }, "DB update whatsapp failed")
  );
  return user;
}

export function updateSaldo(
  telegramId: number,
  amount: number,
  log?: { type: SaldoLogType; refId?: string; note?: string }
): UserProfile | null {
  const user = users.get(telegramId);
  if (!user) return null;
  const balanceBefore = user.saldo;
  user.saldo += amount;
  const balanceAfter = user.saldo;

  run("UPDATE users SET saldo=$1 WHERE telegram_id=$2", [user.saldo, telegramId]).catch(
    (err) => logger.error({ err }, "DB update saldo failed")
  );

  if (log) {
    logSaldo({
      telegramId,
      delta: amount,
      balanceBefore,
      balanceAfter,
      type: log.type,
      refId: log.refId,
      note: log.note,
    });
  }

  return user;
}

/**
 * Atomically deducts `amount` from user saldo using a single DB UPDATE.
 * The WHERE clause (saldo >= amount) guarantees no negative balance even under concurrency.
 * Returns { success: false } if user not found or saldo insufficient.
 */
export async function deductSaldoAtomic(
  telegramId: number,
  amount: number,
  log?: { type: SaldoLogType; refId?: string; note?: string }
): Promise<{ success: boolean; user: UserProfile | null }> {
  const rows = await query<{ saldo: string }>(
    "UPDATE users SET saldo = saldo - $1 WHERE telegram_id = $2 AND saldo >= $1 RETURNING saldo",
    [amount, telegramId]
  );

  if (rows.length === 0) {
    // Insufficient balance or user not found
    return { success: false, user: users.get(telegramId) ?? null };
  }

  const newSaldo = Number(rows[0].saldo);
  const user = users.get(telegramId);
  if (user) {
    const balanceBefore = user.saldo;
    user.saldo = newSaldo;
    if (log) {
      logSaldo({
        telegramId,
        delta: -amount,
        balanceBefore,
        balanceAfter: newSaldo,
        type: log.type,
        refId: log.refId,
        note: log.note,
      });
    }
  }

  return { success: true, user: user ?? null };
}

/**
 * Atomically credits `amount` to user saldo using a single DB UPDATE.
 * Used for topup / refund flows to avoid double-credit under concurrency.
 */
export async function creditSaldoAtomic(
  telegramId: number,
  amount: number,
  log?: { type: SaldoLogType; refId?: string; note?: string }
): Promise<UserProfile | null> {
  const rows = await query<{ saldo: string }>(
    "UPDATE users SET saldo = saldo + $1 WHERE telegram_id = $2 RETURNING saldo",
    [amount, telegramId]
  );

  if (rows.length === 0) return null;

  const newSaldo = Number(rows[0].saldo);
  const user = users.get(telegramId);
  if (user) {
    const balanceBefore = user.saldo;
    user.saldo = newSaldo;
    if (log) {
      logSaldo({
        telegramId,
        delta: amount,
        balanceBefore,
        balanceAfter: newSaldo,
        type: log.type,
        refId: log.refId,
        note: log.note,
      });
    }
  }

  return user ?? null;
}

export function getAllUsers(): UserProfile[] {
  return Array.from(users.values());
}

export function formatRegDate(date: Date): string {
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export async function deleteUser(telegramId: number): Promise<boolean> {
  if (!users.has(telegramId)) return false;
  users.delete(telegramId);
  await run("DELETE FROM saldo_logs WHERE user_id=$1", [telegramId]).catch(() => {});
  await run("DELETE FROM users WHERE telegram_id=$1", [telegramId]);
  return true;
}
