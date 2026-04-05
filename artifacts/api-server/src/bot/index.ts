import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { setupHandlers } from "./handlers";
import { startPackageRefreshScheduler } from "./apiService";
import { loadUsersFromDb } from "./users";
import { loadOrdersFromDb } from "./orders";
import { loadTopupsFromDb } from "./topup";
import { loadStoreFromDb } from "./store";

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
  ]);

  const bot = new TelegramBot(token, { polling: true });
  botInstance = bot;

  setupHandlers(bot);
  startPackageRefreshScheduler(5 * 60 * 1000);

  logger.info("Telegram bot started with polling");
}

export function getBot(): TelegramBot | null {
  return botInstance;
}
