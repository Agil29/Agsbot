import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { type Order, getAllOrders, getOrderByReffId, updateOrderStatus } from "./orders";
import { getUser, creditSaldoAtomic } from "./users";
import { checkDopuOrderStatus } from "./dopuApi";
import { checkDigiflazOrderStatus } from "./digiflazApi";
import { checkKhfyOrderStatus } from "./khfyApi";

const MAX_ATTEMPTS_DOPU = 30;
const MAX_ATTEMPTS_DIGIFLAZ = 60;
const MAX_ATTEMPTS_KHFY = 10; // Poll KHFY max 10x

const INTERVAL_DOPU_MS = 2 * 60 * 1000;     // 2 menit
const INTERVAL_DIGIFLAZ_MS = 45 * 1000;      // 45 detik
const INTERVAL_KHFY_MS = 15 * 1000;          // 15 detik (KHFY biasanya cepat)

const RATELIMIT_BACKOFF_MS = 10 * 60 * 1000; // 10 menit

/**
 * Per-provider sequential request queue.
 */
class ProviderQueue {
  private queue: Array<() => Promise<unknown>> = [];
  private running = false;
  private lastRequestAt = 0;

  constructor(private minGapMs: number, private name: string) {}

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try { resolve(await fn()); }
        catch (e) { reject(e); }
      });
      if (!this.running) this.drain();
    });
  }

  private async drain() {
    this.running = true;
    while (this.queue.length > 0) {
      const gap = this.minGapMs - (Date.now() - this.lastRequestAt);
      if (gap > 0) await new Promise(r => setTimeout(r, gap));
      const fn = this.queue.shift();
      if (fn) {
        this.lastRequestAt = Date.now();
        await fn();
      }
    }
    this.running = false;
    logger.debug({ provider: this.name }, "Provider queue drained");
  }
}

const dopuQueue = new ProviderQueue(15_000, "dopu");
const digiflazQueue = new ProviderQueue(10_000, "digiflaz");
const khfyQueue = new ProviderQueue(5_000, "khfy"); // 5 detik gap antar request KHFY

function queuedCheckStatus(
  provider: "dopu" | "digiflaz" | "khfy",
  reffId: string,
  dopuTrxId?: string,
  khfyTrxId?: string
) {
  if (provider === "dopu") {
    return dopuQueue.enqueue(() => checkDopuOrderStatus(reffId, dopuTrxId));
  }
 if (provider === "khfy") {
  return khfyQueue.enqueue(() => checkKhfyOrderStatus(khfyTrxId ?? reffId));
}
  return digiflazQueue.enqueue(() => checkDigiflazOrderStatus(reffId));
}

let dopuGlobalRateLimitUntil = 0;

function isDopuGloballyRateLimited(): boolean {
  return Date.now() < dopuGlobalRateLimitUntil;
}

function setDopuGlobalRateLimit() {
  dopuGlobalRateLimitUntil = Date.now() + RATELIMIT_BACKOFF_MS;
  logger.warn({ until: new Date(dopuGlobalRateLimitUntil).toISOString() }, "DOPU global rate limit — all DOPU polls paused for 10 min");
}

const activePolls = new Set<string>();

export function startOrderPolling(
  bot: TelegramBot,
  order: Order,
  opts: {
    provider: "dopu" | "digiflaz" | "khfy";
    dopuTrxId?: string;
    khfyTrxId?: string;
    initialAttempt?: number;
    delayMs?: number;
  }
) {
  const { provider, dopuTrxId, khfyTrxId, initialAttempt = 0 } = opts;

  const intervalMs =
    provider === "digiflaz" ? INTERVAL_DIGIFLAZ_MS :
    provider === "khfy" ? INTERVAL_KHFY_MS :
    INTERVAL_DOPU_MS;

  const maxAttempts =
    provider === "digiflaz" ? MAX_ATTEMPTS_DIGIFLAZ :
    provider === "khfy" ? MAX_ATTEMPTS_KHFY :
    MAX_ATTEMPTS_DOPU;

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

      if (provider === "dopu" && isDopuGloballyRateLimited()) {
        const waitMs = dopuGlobalRateLimitUntil - Date.now();
        logger.info({ reffId, waitMs }, "DOPU globally rate limited — skipping poll");
        attempt--;
        setTimeout(poll, waitMs + 5000);
        return;
      }

      const statusRes = await queuedCheckStatus(provider, reffId, dopuTrxId, khfyTrxId);
      logger.info({ reffId, orderId, attempt, status: statusRes.status, provider }, "Pending poll result");

      // ── SUKSES ──────────────────────────────────────────────────────────
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

        // Hitung saldo setelah order
        const userAfter = getUser(chatId);
        const sisaSaldo = userAfter?.saldo ?? 0;

        await bot.sendMessage(
          chatId,
          `✅ <b>ORDER BERHASIL !</b>\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `🔖 Order ID : <code>${orderId}</code>\n` +
          `📦 Produk : <b>${pkgName}</b>\n` +
          `📱 Target : <code>${nomor}</code>\n` +
          `💰 Harga : <b>Rp ${price.toLocaleString("id-ID")}</b>\n` +
          `• Saldo tersisa: <b>Rp ${sisaSaldo.toLocaleString("id-ID")}</b>\n` +
          `📅 Date  : ${tgl}\n\n` +
          `Jam Sukses : ${jam} WIB\n\n` +
          `Terimakasih sudah berbelanja ☺️☺️` +
          circleNote,
          { parse_mode: "HTML" }
        ).catch((err) => logger.error({ err, chatId }, "Poll: failed to notify user (success)"));

        return;
      }

      // ── GAGAL ───────────────────────────────────────────────────────────
      if (statusRes.status === "failed") {
        const ord = getOrderByReffId(reffId);
        if (!ord || ord.status === "cancelled" || ord.status === "done") {
          activePolls.delete(reffId);
          return;
        }

        const refundedUser = await creditSaldoAtomic(chatId, price, {
          type: "order_refund",
          refId: orderId,
          note: `Refund order ${provider} gagal (poll): ${(statusRes as any).error ?? ""}`,
        });

        updateOrderStatus(orderId, "cancelled");
        activePolls.delete(reffId);

        const rawErr = String((statusRes as any).error ?? "");
const keteranganKhfy = rawErr.length > 0 ? rawErr.slice(0, 150) : "";

const newSaldo = refundedUser?.saldo ?? (getUser(chatId)?.saldo ?? 0);

await bot.sendMessage(
  chatId,
  `❌ <b>ORDER GAGAL</b>\n\n` +
  `📦 Produk: <b>${pkgName}</b>\n` +
  `📱 Nomor: <code>${nomor}</code>\n\n` +
  (keteranganKhfy ? `📋 Keterangan : ${keteranganKhfy}\n\n` : `⚠️ Transaksi gagal. Hubungi admin untuk bantuan.\n\n`) +
  `💰 Saldo <b>Rp ${price.toLocaleString("id-ID")}</b> telah dikembalikan.\n` +
  `Saldo sekarang: <b>Rp ${newSaldo.toLocaleString("id-ID")}</b>`,
  { parse_mode: "HTML" }
).catch((err) => logger.error({ err, chatId }, "Poll: failed to notify user (failed)"));

        return;
      }

      // ── RATE LIMIT ──────────────────────────────────────────────────────
      if ((statusRes as any).status === "ratelimit") {
        setDopuGlobalRateLimit();
        attempt--;
        const waitMs = dopuGlobalRateLimitUntil - Date.now() + 5000;
        setTimeout(poll, waitMs);
        return;
      }

      // ── MASIH PENDING ───────────────────────────────────────────────────
      if (attempt < maxAttempts) {
        setTimeout(poll, intervalMs);
      } else {
        // KHFY: setelah max attempts habis tanpa hasil → anggap gagal & refund
        if (provider === "khfy") {
          logger.warn({ reffId, nomor, pkgName, attempt }, "KHFY order timeout — refunding");

          const ord = getOrderByReffId(reffId);
          if (ord && ord.status !== "cancelled" && ord.status !== "done") {
            const refundedUser = await creditSaldoAtomic(chatId, price, {
              type: "order_refund",
              refId: orderId,
              note: `Refund KHFY timeout setelah ${attempt} attempt`,
            });
            updateOrderStatus(orderId, "cancelled");
            const newSaldo = refundedUser?.saldo ?? (getUser(chatId)?.saldo ?? 0);

            await bot.sendMessage(
              chatId,
              `❌ <b>ORDER GAGAL</b>\n\n` +
              `📦 Produk: <b>${pkgName}</b>\n` +
              `📱 Nomor: <code>${nomor}</code>\n\n` +
              `⚠️ Transaksi tidak mendapat respon dari server. Hubungi admin.\n` +
              `🔖 Ref: <code>${reffId}</code>\n\n` +
              `💰 Saldo <b>Rp ${price.toLocaleString("id-ID")}</b> telah dikembalikan.\n` +
              `Saldo sekarang: <b>Rp ${newSaldo.toLocaleString("id-ID")}</b>`,
              { parse_mode: "HTML" }
            ).catch(() => {});
          }
        } else {
          logger.warn({ reffId, nomor, pkgName, provider, attempt }, "Order still pending after max attempts");
        }

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
 * On server startup: resume polling untuk semua order yang masih "processing".
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

    // KHFY sekarang di-poll, bukan di-skip
    if (order.provider === "khfy" || order.category === "akrab2") {
  logger.info({ orderId: order.id }, "Resuming KHFY poll on restart");
  startOrderPolling(bot, order, {
    provider: "khfy",
    khfyTrxId: order.sn || undefined,
    delayMs: 5000 + i * 5000,
  });
  continue;
}

    const provider: "dopu" | "digiflaz" =
      order.provider === "digiflaz" ? "digiflaz" :
      order.provider === "dopu" ? "dopu" :
      (order.category === "akrab1" || order.category === "circle" ? "dopu" : "digiflaz");

    logger.info({ orderId: order.id, provider, source: order.provider ?? "inferred" }, "Resuming poll");

    const staggerMs = 60000 + i * 60000;
    startOrderPolling(bot, order, {
      provider,
      dopuTrxId: order.sn || undefined,
      delayMs: staggerMs,
    });
  }
}
