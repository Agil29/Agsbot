import { Router } from "express";
import { logger } from "../../lib/logger";
import { getAllUsers } from "../../bot/users";
import { getBot } from "../../bot";

import { requireAdmin } from "../../lib/adminAuth";

const router = Router();

router.post("/broadcast", requireAdmin, async (req, res) => {
  const { message, parseMode } = req.body as { message?: string; parseMode?: string };

  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: "Pesan tidak boleh kosong" });
  }

  const bot = getBot();
  if (!bot) {
    return res.status(503).json({ error: "Bot belum aktif" });
  }

  const users = getAllUsers();
  if (users.length === 0) {
    return res.json({ success: true, sent: 0, failed: 0, total: 0 });
  }

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await bot.sendMessage(user.telegramId, message.trim(), {
        parse_mode: (parseMode as any) ?? "HTML",
      });
      sent++;
    } catch (err: any) {
      failed++;
      logger.warn({ userId: user.telegramId, err: err?.message }, "Broadcast failed for user");
    }
    // Throttle to stay within Telegram rate limits (30 msg/sec)
    await new Promise(r => setTimeout(r, 40));
  }

  logger.info({ sent, failed, total: users.length }, "Broadcast completed");
  res.json({ success: true, sent, failed, total: users.length });
});

export default router;
