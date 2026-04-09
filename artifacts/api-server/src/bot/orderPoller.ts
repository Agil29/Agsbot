import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { type Order, getAllOrders, getOrderByReffId, updateOrderStatus } from "./orders";
import { getUser, creditSaldoAtomic } from "./users";
import { checkDopuOrderStatus } from "./dopuApi";
import { checkDigiflazOrderStatus } from "./digiflazApi";

const MAX_ATTEMPTS_DOPU = 30;
const MAX_ATTEMPTS_DIGIFLAZ = 60;    // check up to 60x (30 minutes at 30s interval)
const INTERVAL_DOPU_MS = 90 * 1000;         // 90 seconds for DOPU
const INTERVAL_DIGIFLAZ_MS = 30 * 1000;     // 30 seconds for Digiflaz (no webhook available)
const RATELIMIT_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes on rate limit

/**
 * Global DOPU rate limit: when ANY DOPU order gets rate-limited, ALL DOPU polls pause until this timestamp.
 * This prevents simultaneous polling from multiple orders all hitting DOPU at once.
 */
let dopuGlobalRateLimitUntil = 0;

function isDopuGloballyRateLimited(): boolean {
  return Date.now() < dopuGlobalRateLimitUntil;
}

function setDopuGlobalRateLimit() {
  dopuGlobalRateLimitUntil = Date.now() + RATELIMIT_BACKOFF_MS;
  logger.warn({ until: new Date(dopuGlobalRateLimitUntil).toISOString() }, "DOPU global rate limit set — all DOPU polls paused for 5 min");
}

/**
 * Start polling for a single DOPU/Digiflaz order.
 * Safe to call multiple times — uses a per-reffId lock to prevent duplicate polls.
 */
const activePolls = new Set<string>();

export function startOrderPolling(
  bot: TelegramBot,
  order: Order,
  opts: {
    provider: "dopu" | "digiflaz";
    dopuTrxId?: string;
    initialAttempt?: number;
    delayMs?: number;
  }
) {
  const { provider, dopuTrxId, initialAttempt = 0 } = opts;
  const intervalMs = provider === "digiflaz" ? INTERVAL_DIGIFLAZ_MS : INTERVAL_DOPU_MS;
  const maxAttempts = provider === "digiflaz" ? MAX_ATTEMPTS_DIGIFLAZ : MAX_ATTEMPTS_DOPU;
  const delayMs = opts.delayMs ?? intervalMs;

  const reffId = order.reffId;
  if (!reffId) return;
  if (activePolls.has(reffId)) {
    logger.info({ reffId }, "Poll already active — skip duplicate");
    return;
  }
  activePolls.add(reffId);

  const orderId = order.id;
  const chatId = order.userId;
  const pkgName = order.packageName;
  const nomor = order.nomorTujuan ?? "-";
  const price = order.price;
  const category = order.category;
  let attempt = initialAttempt;

  const poll = async () => {
    attempt++;
    try {
      const currentOrd = getOrderByReffId(reffId);
      if (!currentOrd || currentOrd.status === "done" || currentOrd.status === "cancelled") {
        logger.info({ reffId, status: currentOrd?.status }, "Poll: order already finalized — stopping");
        activePolls.delete(reffId);
        return;
      }

      // If DOPU is globally rate limited, skip this attempt and retry after backoff
      if (provider === "dopu" && isDopuGloballyRateLimited()) {
        const waitMs = dopuGlobalRateLimitUntil - Date.now();
        logger.info({ reffId, waitMs }, "DOPU globally rate limited — skipping poll, scheduling retry");
        attempt--; // don't count against max attempts
        setTimeout(poll, waitMs + 5000);
        return;
      }

      const statusRes =
        provider === "digiflaz"
          ? await checkDigiflazOrderStatus(reffId)
          : await checkDopuOrderStatus(reffId, dopuTrxId);

      logger.info({ reffId, orderId, attempt, status: statusRes.status, provider }, "Pending poll result");

      if (statusRes.status === "success") {
        const ord = getOrderByReffId(reffId);
        if (!ord || ord.status === "done" || ord.status === "cancelled") {
          logger.info({ reffId }, "Poll: success ignored — already finalized");
          activePolls.delete(reffId);
          return;
        }
        updateOrderStatus(orderId, "done", statusRes.sn);
        activePolls.delete(reffId);

        const circleNote =
          category === "circle" && provider !== "digiflaz"
            ? `\n\n📱 Buka aplikasi MyXL → konfirmasi undangan Circle.`
            : "";
        const now = new Date();
        const tgl = now.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
        const jam = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
        await bot
          .sendMessage(
            chatId,
            `✅ <b>ORDER BERHASIL !</b>\n` +
              `━━━━━━━━━━━━━━━━━━━\n` +
              `🔖 Order ID  : <code>${orderId}</code>\n` +
              `📦 Produk : <b>${pkgName}</b>\n` +
              `📱 Target : <code>${nomor}</code>\n` +
              `💰 Harga : <b>Rp ${price.toLocaleString("id-ID")}</b>\n` +
              `📅 Date  : ${tgl}\n\n` +
              `Jam Sukses : ${jam} WIB\n\n` +
              `Terimakasih sudah berbelanja ☺️☺️` +
              circleNote,
            { parse_mode: "HTML" }
          )
          .catch((err) => logger.error({ err, chatId }, "Poll: failed to notify user (success)"));
        return;
      }

      if (statusRes.status === "failed") {
        const ord = getOrderByReffId(reffId);
        if (!ord || ord.status === "cancelled" || ord.status === "done") {
          activePolls.delete(reffId);
          return;
        }
        await creditSaldoAtomic(chatId, price, {
          type: "order_refund",
          refId: orderId,
          note: `Refund order ${provider} gagal (poll): ${(statusRes as any).error ?? ""}`,
        });
        updateOrderStatus(orderId, "cancelled");
        activePolls.delete(reffId);

        const refundedUser = getUser(chatId);
        await bot
          .sendMessage(
            chatId,
            `❌ <b>ORDER GAGAL</b>\n\n` +
              `📦 Produk: <b>${pkgName}</b>\n` +
              `📱 Nomor: <code>${nomor}</code>\n\n` +
              `⚠️ ${(statusRes as any).error ?? "Transaksi gagal"}\n` +
              `🔖 Ref: <code>${reffId}</code>\n\n` +
              `💰 Saldo <b>Rp ${price.toLocaleString("id-ID")}</b> telah dikembalikan.\n` +
              `Saldo sekarang: <b>Rp ${(refundedUser?.saldo ?? 0).toLocaleString("id-ID")}</b>`,
            { parse_mode: "HTML" }
          )
          .catch((err) => logger.error({ err, chatId }, "Poll: failed to notify user (failed)"));
        return;
      }

      // Rate limited — set GLOBAL backoff so all DOPU polls pause, not just this one
      if ((statusRes as any).status === "ratelimit") {
        setDopuGlobalRateLimit();
        attempt--; // don't count this against max attempts
        const waitMs = dopuGlobalRateLimitUntil - Date.now() + 5000;
        setTimeout(poll, waitMs);
        return;
      }

      // Still pending
      if (attempt < maxAttempts) {
        setTimeout(poll, intervalMs);
      } else {
        logger.warn({ reffId, nomor, pkgName, provider, attempt }, "Order still pending after max attempts");
        activePolls.delete(reffId);
      }
    } catch (err) {
      logger.error({ err, reffId, attempt }, "Error during order status poll");
      if (attempt < maxAttempts) setTimeout(poll, intervalMs);
      else activePolls.delete(reffId);
    }
  };

  setTimeout(poll, delayMs);
}

/**
 * On server startup: find all orders still in "processing" state and resume polling.
 * These are orders that were in-flight when the server was restarted.
 */
export function resumeProcessingOrders(bot: TelegramBot) {
  const processing = getAllOrders().filter((o) => o.status === "processing" && o.reffId);
  if (processing.length === 0) {
    logger.info("No processing orders to resume");
    return;
  }
  logger.info({ count: processing.length }, "Resuming polling for processing orders after restart");

  for (let i = 0; i < processing.length; i++) {
    const order = processing[i];

    // Determine provider:
    // 1. Use stored provider field if available (most reliable)
    // 2. Fall back to category-based heuristic (akrab1/circle → dopu, others → digiflaz)
    // 3. Skip akrab2/KHFY — synchronous, should never be "processing"
    if (order.provider === "khfy" || order.category === "akrab2") {
      logger.warn({ orderId: order.id, category: order.category }, "Skipping resume poll for KHFY — synchronous");
      continue;
    }

    const provider: "dopu" | "digiflaz" = order.provider === "digiflaz"
      ? "digiflaz"
      : order.provider === "dopu"
        ? "dopu"
        : (order.category === "akrab1" || order.category === "circle" ? "dopu" : "digiflaz");

    logger.info({ orderId: order.id, provider, source: order.provider ?? "inferred" }, "Resuming poll");

    // Stagger polls: 30s apart per order to avoid rate limits on startup
    const staggerMs = 30000 + i * 30000;
    startOrderPolling(bot, order, {
      provider,
      dopuTrxId: order.sn || undefined,
      delayMs: staggerMs,
    });
  }
}
