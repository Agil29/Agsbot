import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { initDb } from "../lib/initDb";
import { setupHandlers } from "./handlers";
import { startPackageRefreshScheduler } from "./apiService";
import { startTopupExpiryChecker } from "./topupExpiry";
import { loadUsersFromDb } from "./users";
import { loadOrdersFromDb } from "./orders";
import { loadTopupsFromDb } from "./topup";
import { loadStoreFromDb } from "./store";
import { loadMarkupFromDb } from "./markup";
import { loadProductMarkupsFromDb } from "./productMarkup";
import { loadBlacklistFromDb } from "./blacklist";

let botInstance: TelegramBot | null = null;

export async function startBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set – bot will not start");
    return;
  }

  // Safety guard: only start polling when explicitly enabled.
  // Set ENABLE_BOT=true on VPS only — prevents Replit dev instance from
  // competing with production for Telegram updates.
  if (process.env.ENABLE_BOT !== "true") {
    logger.warn("ENABLE_BOT is not 'true' — bot polling disabled (HTTP server still runs)");
    return;
  }

  if (botInstance) {
    logger.info("Bot already running");
    return;
  }

  // Ensure all tables exist (safe to run every start)
  await initDb();

  // Load all persistent data from DB
  await Promise.all([
    loadUsersFromDb(),
    loadOrdersFromDb(),
    loadTopupsFromDb(),
    loadStoreFromDb(),
    loadMarkupFromDb(),
    loadProductMarkupsFromDb(),
    loadBlacklistFromDb(),
  ]);

  const bot = new TelegramBot(token, { polling: false });
  botInstance = bot;

  // Drop pending updates so stale messages from before restart are not reprocessed
  try {
    await bot.deleteWebhook({ drop_pending_updates: true });
  } catch { }

  // interval:0 = immediately re-poll after each batch (no artificial 300ms wait)
  // timeout:30 = long-poll 30s so the server holds the connection until an update arrives
  bot.startPolling({ interval: 0, params: { timeout: 30 } });

  setupHandlers(bot);
  startPackageRefreshScheduler(5 * 60 * 1000);
  startTopupExpiryChecker(bot);

  // Register bot commands visible to all users
  const defaultCommands = [
    { command: "start", description: "Profil & Menu Utama" },
    { command: "order", description: "Order paket XL" },
    { command: "chatadmin", description: "Chat dengan admin" },
  ];
  await bot.setMyCommands(defaultCommands).catch(() => {});

  // Register admin-specific commands for each admin (scoped to their chat)
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));

  const adminCommands = [
    ...defaultCommands,
    { command: "broadcast", description: "Broadcast pesan ke semua user" },
    { command: "cancel", description: "Batalkan broadcast aktif" },
  ];

  for (const adminId of adminIds) {
    await bot.setMyCommands(adminCommands, { scope: { type: "chat", chat_id: adminId } }).catch(() => {});
  }

  logger.info("Telegram bot started with polling");
}

export function getBot(): TelegramBot | null {
  return botInstance;
}
