import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi." });
  }

  const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "";
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
  const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "";

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    logger.error("ADMIN_USERNAME or ADMIN_PASSWORD env var not set");
    return res.status(500).json({ error: "Konfigurasi server tidak lengkap." });
  }

  const usernameMatch = username.trim() === ADMIN_USERNAME;
  const passwordMatch = password === ADMIN_PASSWORD;

  if (!usernameMatch || !passwordMatch) {
    logger.warn({ ip: req.ip, username }, "Failed admin login attempt");
    return res.status(401).json({ error: "Username atau password salah." });
  }

  logger.info({ ip: req.ip, username }, "Admin login success");
  return res.json({ token: ADMIN_KEY });
});

export default router;
