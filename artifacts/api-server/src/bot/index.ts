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

  const bot = new TelegramBot(token, { polling: false });
  botInstance = bot;

  // Drain all pending updates so stale messages from before restart are not reprocessed
  try {
    await bot.deleteWebhook({ drop_pending_updates: true });
    // Extra safety: consume any queued updates via getUpdates before starting polling
    let drained = false;
    while (!drained) {
      const updates = await bot.getUpdates({ offset: -1, limit: 1, timeout: 0 });
      if (updates.length === 0) {
        drained = true;
      } else {
        await bot.getUpdates({ offset: updates[updates.length - 1].update_id + 1, limit: 1, timeout: 0 });
        drained = true;
      }
    }
  } catch { }

  bot.startPolling();

  setupHandlers(bot);
  startPackageRefreshScheduler(5 * 60 * 1000);

  logger.info("Telegram bot started with polling");
}

export function getBot(): TelegramBot | null {
  return botInstance;
}
