import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

// DOPU callback endpoint — accepts GET and POST
// DOPU sends transaction result notifications here
router.all("/dopu/callback", (req, res) => {
  const data = { ...req.query, ...req.body };
  logger.info({ data }, "DOPU callback received");

  // Always respond 200 so DOPU doesn't retry
  res.status(200).json({ status: "ok" });
});

export default router;
