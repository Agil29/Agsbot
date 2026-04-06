import { query, run } from "../lib/db";
import { logger } from "../lib/logger";
import { logSaldo, type SaldoLogType } from "./saldoLog";

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
