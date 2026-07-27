import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import dopuCallbackRouter from "./routes/dopuCallback";
import digiflazCallbackRouter from "./routes/digiflazCallback";
import khfyCallbackRouter from "./routes/khfyCallback";
import webhookRouter from "./routes/webhook";
import { logger } from "./lib/logger";

const app: Express = express();

// CORS: only allow configured origins or same-host requests
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN ?? "";
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin / non-browser (no Origin header)
      if (!origin) return cb(null, true);
      // Allow explicitly whitelisted origin
      if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) return cb(null, true);
      // Allow Replit preview domains (*.replit.dev / *.pike.replit.dev)
      if (/\.replit\.dev$/.test(origin)) return cb(null, true);
      cb(new Error("CORS: origin not allowed"));
    },
    credentials: true,
  })
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount webhooks at both root and /api so any portal URL works:
// - https://agilbot.my.id/webhook/dopu  OR  /api/webhook/dopu
// - https://agilbot.my.id/webhook/pakasir  OR  /api/webhook/pakasir
app.use(dopuCallbackRouter);
app.use("/api", dopuCallbackRouter);
app.use(digiflazCallbackRouter);
app.use("/api", digiflazCallbackRouter);
app.use("/webhook", webhookRouter);
app.use("/api", router);

import { createRequire as _cr } from "module";
const adminDistPath = new URL("../../admin-dashboard/dist/public", import.meta.url).pathname;
app.use("/admin", (await import("express")).default.static(adminDistPath, { index: "index.html" }));
app.get(["/admin", "/admin/", "/admin/*splat"], (_req, res) => { res.sendFile(adminDistPath + "/index.html"); });

export default app;
