const WINDOW_MS = 5_000;      // 5-second rolling window
const MAX_MESSAGES = 5;        // max messages per window before cooldown
const COOLDOWN_MS = 30_000;    // 30-second cooldown

type UserData = {
  timestamps: number[];
  blockedUntil: number;
};

const store = new Map<number, UserData>();

function getData(userId: number): UserData {
  if (!store.has(userId)) store.set(userId, { timestamps: [], blockedUntil: 0 });
  return store.get(userId)!;
}

/**
 * Record a new message/action and return rate-limit status.
 * "ok"      → within limit, proceed normally
 * "warn"    → just crossed the limit — send warning message once
 * "blocked" → still in cooldown — silently ignore
 */
export function recordAndCheck(userId: number): { status: "ok" | "warn" | "blocked"; secondsLeft: number } {
  const now = Date.now();
  const d = getData(userId);

  if (d.blockedUntil > now) {
    return { status: "blocked", secondsLeft: Math.ceil((d.blockedUntil - now) / 1000) };
  }

  if (d.blockedUntil > 0) {
    d.blockedUntil = 0;
    d.timestamps = [];
  }

  d.timestamps = d.timestamps.filter(t => now - t < WINDOW_MS);
  d.timestamps.push(now);

  if (d.timestamps.length > MAX_MESSAGES) {
    d.blockedUntil = now + COOLDOWN_MS;
    d.timestamps = [];
    return { status: "warn", secondsLeft: Math.ceil(COOLDOWN_MS / 1000) };
  }

  return { status: "ok", secondsLeft: 0 };
}

/** Returns true if the user is currently in cooldown. */
export function isBlocked(userId: number): boolean {
  const d = getData(userId);
  return d.blockedUntil > Date.now();
}
