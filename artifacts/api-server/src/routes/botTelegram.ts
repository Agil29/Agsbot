import { Router } from "express";
import { logger } from "../lib/logger";
import { getBot } from "../bot";

const router = Router();

router.post("/bot-telegram", (req, res) => {
  const bot = getBot();
  if (!bot) {
    return res.status(503).json({ ok: false, message: "Bot not ready" });
  }
  try {
    bot.processUpdate(req.body);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error processing Telegram webhook update");
    res.status(500).json({ ok: false });
  }
});

export default router;
