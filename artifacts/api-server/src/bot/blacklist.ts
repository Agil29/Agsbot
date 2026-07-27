import { query, run } from "../lib/db";
import { logger } from "../lib/logger";

export type BlacklistEntry = {
  telegramId: number;
  reason?: string;
  blockedAt: Date;
};

const blocked = new Set<number>();
const entries = new Map<number, BlacklistEntry>();

export async function loadBlacklistFromDb(): Promise<void> {
  try {
    const rows = await query<{ telegram_id: string; reason: string | null; blocked_at: string }>(
      "SELECT telegram_id, reason, blocked_at FROM blacklist"
    );
    blocked.clear();
    entries.clear();
    for (const row of rows) {
      const id = Number(row.telegram_id);
      blocked.add(id);
      entries.set(id, {
        telegramId: id,
        reason: row.reason ?? undefined,
        blockedAt: new Date(row.blocked_at),
      });
    }
    logger.info({ count: blocked.size }, "Loaded blacklist from DB");
  } catch (err) {
    logger.error({ err }, "Failed to load blacklist from DB");
  }
}

export function isBlacklisted(telegramId: number): boolean {
  return blocked.has(telegramId);
}

export function getAllBlacklist(): BlacklistEntry[] {
  return Array.from(entries.values()).sort((a, b) => b.blockedAt.getTime() - a.blockedAt.getTime());
}

export async function addToBlacklist(telegramId: number, reason?: string): Promise<BlacklistEntry> {
  const entry: BlacklistEntry = { telegramId, reason, blockedAt: new Date() };
  blocked.add(telegramId);
  entries.set(telegramId, entry);
  await run(
    `INSERT INTO blacklist (telegram_id, reason, blocked_at)
     VALUES ($1, $2, now())
     ON CONFLICT (telegram_id) DO UPDATE SET reason=$2, blocked_at=now()`,
    [telegramId, reason ?? null]
  );
  return entry;
}

export async function removeFromBlacklist(telegramId: number): Promise<boolean> {
  if (!blocked.has(telegramId)) return false;
  blocked.delete(telegramId);
  entries.delete(telegramId);
  await run("DELETE FROM blacklist WHERE telegram_id=$1", [telegramId]);
  return true;
}
