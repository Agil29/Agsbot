import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

const ADMIN_KEY = process.env.ADMIN_API_KEY;

if (!ADMIN_KEY) {
  logger.warn("ADMIN_API_KEY environment variable is not set. Admin API will reject all requests.");
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== ADMIN_KEY) {
    logger.warn({ ip: req.ip, url: req.url }, "Unauthorized admin API access attempt");
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
