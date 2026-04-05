import app from "./app";
import { logger } from "./lib/logger";
import { startBot } from "./bot";

// Prevent unhandled promise rejections (e.g. Telegram API 400/409 errors) from crashing the server
process.on("unhandledRejection", (reason) => {
  logger.warn({ reason }, "Unhandled promise rejection — ignored to keep server alive");
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startBot().catch((e) => {
    logger.error({ err: e }, "Failed to start bot");
    process.exit(1);
  });
});
