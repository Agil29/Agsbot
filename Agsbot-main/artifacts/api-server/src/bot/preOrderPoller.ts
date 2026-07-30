import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { fetchAkrabStock } from "./apiService";
import { getPendingPreOrders, updatePreOrderStatus, type PreOrder } from "./preOrders";
import { placeKhfyOrder } from "./khfyApi";
import { checkKhfyOrderStatus } from "./khfyApi";
import { creditSaldoAtomic, getUser } from "./users";
import { createOrder, updateOrderStatus } from "./orders";
import { startOrderPolling } from "./orderPoller";
import { randomUUID } from "crypto";

const POLL_INTERVAL_MS = 3 * 60 * 1000; // cek stock setiap 3 menit
const PROCESS_DELAY_MS = 3000;           // jeda antar submit ke KHFY

let pollerStarted = false;

/**
 * Proses satu pre-order ke KHFY.
 * Returns true jika berhasil submit (bukan berarti sudah done, hanya diterima KHFY).
 */
async function processPreOrder(bot: TelegramBot, po: PreOrder): Promise<boolean> {
  const reffId = randomUUID().replace(/-/g, "").slice(0, 20);

  // tandai processing sebelum panggil API agar tidak dobel-kirim
  updatePreOrderStatus(po.id, "processing", { reffId });

  logger.info({ preOrderId: po.id, sku: po.sku, nomor: po.nomorTujuan }, "Submitting pre-order to KHFY");

  const result = await placeKhfyOrder({ sku: po.sku, tujuan: po.nomorTujuan, reffId });

  if (!result.success) {
    logger.warn({ preOrderId: po.id, error: result.error }, "KHFY rejected pre-order — reverting to pending");
    // kembalikan ke pending supaya dicoba lagi saat stock ada
    updatePreOrderStatus(po.id, "pending", { reffId: undefined });

    // Beritahu user
    await bot.sendMessage(
      po.userId,
      `⚠️ <b>Pre Order Gagal Diproses</b>\n\n` +
      `📦 Paket: <b>${po.packageName}</b>\n` +
      `📱 Nomor: <code>${po.nomorTujuan}</code>\n\n` +
      `Keterangan: ${result.error}\n\n` +
      `Order pre order Anda masih aktif dan akan dicoba lagi saat stok tersedia.`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    return false;
  }

  // Buat order record
  const user = getUser(po.userId);
  const newOrder = createOrder({
    userId: po.userId,
    userName: po.userName,
    userUsername: po.userUsername,
    category: "akrab2",
    packageId: po.packageId,
    packageName: po.packageName,
    price: po.price,
    baseprice: po.baseprice,
    quota: "",
    validity: "",
    nomorTujuan: po.nomorTujuan,
    reffId,
    paymentMethod: po.paymentMethod,
    provider: "khfy",
    sn: result.sn || undefined,
  });

  const khfyTrxId = (result as any).trxid || result.sn || undefined;

  if (khfyTrxId) {
    updateOrderStatus(newOrder.id, "processing", khfyTrxId);
    updatePreOrderStatus(po.id, "processing", { reffId, sn: khfyTrxId });

    // Mulai polling status ke KHFY
    startOrderPolling(bot, newOrder, { provider: "khfy", khfyTrxId, delayMs: 5000 });

    // Listen on polling done to finalize pre-order
    watchOrderForPreOrder(bot, newOrder.id, po);
  } else if (result.sn) {
    // Langsung sukses
    updateOrderStatus(newOrder.id, "done", result.sn);
    updatePreOrderStatus(po.id, "done", { sn: result.sn });

    const now = new Date();
    const tgl = now.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
    const jam = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

    await bot.sendMessage(
      po.userId,
      `✅ <b>PRE ORDER BERHASIL DIPROSES !</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🔖 Pre Order ID : <code>${po.id}</code>\n` +
      `📦 Produk : <b>${po.packageName}</b>\n` +
      `📱 Target : <code>${po.nomorTujuan}</code>\n` +
      `💰 Harga : <b>Rp ${po.price.toLocaleString("id-ID")}</b>\n` +
      `📅 Date  : ${tgl}\n\n` +
      `Jam Sukses : ${jam} WIB\n\n` +
      `Stok sudah tersedia dan paket langsung masuk. Terimakasih ☺️`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  } else {
    // Pending tanpa trxid — tetap processing, tunggu polling
    updateOrderStatus(newOrder.id, "processing");
    updatePreOrderStatus(po.id, "processing", { reffId });
    startOrderPolling(bot, newOrder, { provider: "khfy", delayMs: 5000 });
    watchOrderForPreOrder(bot, newOrder.id, po);
  }

  return true;
}

/**
 * Pantau order yang dibuat dari pre-order — saat polling selesai (done/cancelled),
 * update status pre-order dan notif user.
 */
function watchOrderForPreOrder(bot: TelegramBot, orderId: string, po: PreOrder) {
  const { getOrderById } = require("./orders");
  const CHECK_INTERVAL = 15 * 1000;
  const MAX_WATCH = 40; // ~10 menit
  let attempts = 0;

  const iv = setInterval(async () => {
    attempts++;
    const order = getOrderById(orderId);
    if (!order) { clearInterval(iv); return; }

    if (order.status === "done") {
      clearInterval(iv);
      const preCurrent = (await import("./preOrders")).getPreOrderById(po.id);
      if (preCurrent && preCurrent.status !== "done" && preCurrent.status !== "cancelled") {
        updatePreOrderStatus(po.id, "done", { sn: order.sn });
      }
      // Notif sudah dikirim oleh orderPoller
      return;
    }

    if (order.status === "cancelled") {
      clearInterval(iv);
      const preCurrent = (await import("./preOrders")).getPreOrderById(po.id);
      if (preCurrent && preCurrent.status !== "done" && preCurrent.status !== "cancelled") {
        // Refund sudah dilakukan orderPoller, kembalikan pre-order ke pending untuk dicoba ulang
        updatePreOrderStatus(po.id, "pending", { reffId: undefined });

        await bot.sendMessage(
          po.userId,
          `⚠️ <b>Pre Order Gagal, Akan Dicoba Lagi</b>\n\n` +
          `📦 Paket: <b>${po.packageName}</b>\n` +
          `📱 Nomor: <code>${po.nomorTujuan}</code>\n\n` +
          `Order gagal diproses tapi saldo sudah dikembalikan. Pre order Anda masih aktif dan akan diproses otomatis saat stok tersedia.`,
          { parse_mode: "HTML" }
        ).catch(() => {});
      }
      return;
    }

    if (attempts >= MAX_WATCH) {
      clearInterval(iv);
    }
  }, CHECK_INTERVAL);
}

/**
 * Main loop: setiap POLL_INTERVAL_MS, cek stock KHFY.
 * Untuk tiap SKU yang stoknya > 0, proses semua pre-order pending dengan SKU tersebut.
 */
async function checkAndProcessPreOrders(bot: TelegramBot) {
  const pending = getPendingPreOrders();
  if (pending.length === 0) return;

  logger.info({ count: pending.length }, "Pre-order poller: checking KHFY stock");

  const stockMap = await fetchAkrabStock().catch(() => null);
  if (!stockMap) {
    logger.warn("Pre-order poller: could not fetch stock, skipping");
    return;
  }

  // Group pending pre-orders by SKU
  const bySku = new Map<string, PreOrder[]>();
  for (const po of pending) {
    const skuKey = po.sku.toUpperCase();
    if (!bySku.has(skuKey)) bySku.set(skuKey, []);
    bySku.get(skuKey)!.push(po);
  }

  for (const [sku, orders] of bySku) {
    const stock = stockMap.get(sku) ?? 0;
    if (stock <= 0) {
      logger.info({ sku, stock }, "Pre-order poller: SKU out of stock, skip");
      continue;
    }

    logger.info({ sku, stock, pendingCount: orders.length }, "Pre-order poller: stock available, processing");

    // Proses satu per satu (tidak melebihi stok yang tersedia)
    let processed = 0;
    for (const po of orders) {
      if (processed >= stock) {
        logger.info({ sku, processed, stock }, "Pre-order poller: stock exhausted mid-batch");
        break;
      }
      await processPreOrder(bot, po);
      processed++;
      await new Promise((r) => setTimeout(r, PROCESS_DELAY_MS));
    }
  }
}

export function startPreOrderPoller(bot: TelegramBot) {
  if (pollerStarted) return;
  pollerStarted = true;
  logger.info("Pre-order poller started");

  // Run immediately then on interval
  setTimeout(() => checkAndProcessPreOrders(bot), 10_000);
  setInterval(() => checkAndProcessPreOrders(bot), POLL_INTERVAL_MS);
}
