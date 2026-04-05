import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { setupHandlers } from "./handlers";
import { startPackageRefreshScheduler } from "./apiService";
import { loadUsersFromDb } from "./users";
import { loadOrdersFromDb } from "./orders";
import { loadTopupsFromDb } from "./topup";
import { loadStoreFromDb } from "./store";
import { loadMarkupFromDb } from "./markup";

let botInstance: TelegramBot | null = null;

export async function startBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set – bot will not start");
    return;
  }

  if (botInstance) {
    logger.info("Bot already running");
    return;
  }

  // Load all persistent data from DB before starting
  await Promise.all([
    loadUsersFromDb(),
    loadOrdersFromDb(),
    loadTopupsFromDb(),
    loadStoreFromDb(),
    loadMarkupFromDb(),
  ]);

  // Create bot WITHOUT polling — we use webhook mode
  const bot = new TelegramBot(token, { polling: false });
  botInstance = bot;

  setupHandlers(bot);
  startPackageRefreshScheduler(5 * 60 * 1000);

  // Build webhook URL from environment
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (!domain) {
    logger.warn("REPLIT_DEV_DOMAIN not set — falling back to polling");
    // Fallback: delete any existing webhook then poll
    try { await bot.deleteWebhook({ drop_pending_updates: true }); } catch { }
    await new Promise((r) => setTimeout(r, 3000));
    bot.startPolling();
    logger.info("Telegram bot started with polling (fallback)");
    return;
  }

  const webhookUrl = `https://${domain}/api/bot-telegram`;

  try {
    await bot.setWebHook(webhookUrl, { drop_pending_updates: true } as any);
    logger.info({ webhookUrl }, "Telegram bot webhook set — using webhook mode");
  } catch (err) {
    logger.error({ err }, "Failed to set webhook — falling back to polling");
    try { await bot.deleteWebhook({ drop_pending_updates: true }); } catch { }
    await new Promise((r) => setTimeout(r, 3000));
    bot.startPolling();
    logger.info("Telegram bot started with polling (fallback after webhook error)");
  }

  logger.info("Telegram bot started");
}

export function getBot(): TelegramBot | null {
  return botInstance;
}
