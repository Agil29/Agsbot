import TelegramBot from "node-telegram-bot-api";
import QRCode from "qrcode";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";
import { getPackages, type Category } from "./store";
import { refreshAllPackages } from "./apiService";
import { getSession, setSession, clearSession } from "./sessions";
import { getOrRegisterUser, getUser, setWhatsapp, formatRegDate, getAllUsers, deductSaldoAtomic, creditSaldoAtomic, withUserLock, updateSaldo } from "./users";
import { getMarkup, applyMarkup } from "./markup";
import { getProductMarkup } from "./productMarkup";
import { isBlacklisted } from "./blacklist";
import { createOrder, getOrdersByUser, formatOrderDate, statusLabel, getOrderByReffId, updateOrderStatus, getAllOrders, getOrderById } from "./orders";
import { startOrderPolling } from "./orderPoller";
import { createPakasirTopup, getTopupById, updateTopupStatus, calculateFee, checkPakasirStatus, getTopupsByUser } from "./topup";
import { recordAndCheck, isBlocked } from "./rateLimit";
import { placeKhfyOrder, getKhfyBalance } from "./khfyApi";
import { placeDopuOrder, checkDopuOrderStatus, getDopuBalance, sanitizeDopuError, type DopuOrderResult } from "./dopuApi";
import { placeDigiflazOrder, checkDigiflazOrderStatus, type DigiflazOrderResult } from "./digiflazApi";
import {
  mainMenuKeyboard,
  categoryInlineKeyboard,
  packageInlineKeyboard,
  confirmOrderKeyboard,
  paymentMethodKeyboard,
  backToCategoryKeyboard,
  preOrderPackageKeyboard,
  preOrderPaymentKeyboard,
  type PackageKeyboardOpts,
} from "./keyboards";
import {
  createPreOrder,
  hasActivePendingPreOrder,
} from "./preOrders";

const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME ?? "Agsstore_29";
const DOPU_CEK_STOK_URL = process.env.CEK_STOK_AKRAB1_URL ?? "https://juraganxl.my.id/";

function getAdminIds(): number[] {
  const raw = process.env.ADMIN_TELEGRAM_IDS ?? process.env.ADMIN_TELEGRAM_ID ?? "";
  return raw.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

function isAdmin(userId: number): boolean {
  const ids = getAdminIds();
  return ids.length > 0 && ids.includes(userId);
}

async function doBroadcast(
  bot: TelegramBot,
  message: string,
): Promise<{ sent: number; failed: number; total: number }> {
  const users = getAllUsers();
  let sent = 0, failed = 0;
  for (const user of users) {
    try {
      await bot.sendMessage(user.telegramId, message, { parse_mode: "HTML" });
      sent++;
    } catch {
      failed++;
    }
    await new Promise(r => setTimeout(r, 40));
  }
  return { sent, failed, total: users.length };
}

function pkgKeyboardOpts(category: Category, packages: ReturnType<typeof getPackages> = []): PackageKeyboardOpts {
  if (category === "circle") {
    // 2 columns, all packages on one page, no pagination
    return { columns: 2, pageSize: packages.length || undefined, cekStokUrl: DOPU_CEK_STOK_URL };
  }
  if (category === "akrab1") {
    // 2 columns, all packages on one page, no pagination
    return { columns: 2, pageSize: packages.length || undefined, cekStokUrl: DOPU_CEK_STOK_URL, showRefreshStock: true };
  }
  if (category === "akrab2") {
    return { columns: 2, pageSize: packages.length || undefined, showRefreshStock: true };
  }
  return {};
}

function buildProfileText(user: ReturnType<typeof getUser>): string {
  if (!user) return "Profil tidak ditemukan.";
  return (
    `👨🏿‍🦰 <b>PROFIL ANDA</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 Nama: <b>${user.firstName}${user.lastName ? " " + user.lastName : ""}</b>\n` +
    `📋 ID: <code>${user.telegramId}</code>\n` +
    (user.username ? `📌 User: @${user.username}\n` : "") +
    (user.whatsapp ? `📱 Wa: <code>${user.whatsapp}</code>\n` : "") +
    `🐥 UID: <b>${user.uid}</b>\n` +
    `📅 Tgl Terdaftar : <b>${formatRegDate(user.regDate)}</b>\n\n` +
    `<b>Saldo: Rp ${user.saldo.toLocaleString("id-ID")}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Ada kendala? Hubungi @${SUPPORT_USERNAME}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `🏄🏾‍♂️ Topup game dan paket data all operator langsung ke : @Agsstorebot`
  );
}

function getPackagesWithMarkup(category: Category) {
  const categoryMarkup = getMarkup(category);
  return getPackages(category).map((pkg) => {
    // Per-product markup overrides category markup when set
    const perProduct = pkg.sku ? getProductMarkup(pkg.sku) : null;
    const activeMarkup = perProduct ?? categoryMarkup;
    return {
      ...pkg,
      baseprice: pkg.price,
      price: applyMarkup(pkg.price, activeMarkup),
      hasProductMarkup: perProduct !== null,
    };
  });
}

async function sendTopupQR(bot: TelegramBot, chatId: number, userId: number, nominal: number) {
  const user = getUser(userId);
  const userName = user ? user.firstName + (user.lastName ? " " + user.lastName : "") : String(userId);

  await bot.sendMessage(chatId, "⏳ <b>Membuat QRIS...</b>\n\nMohon tunggu sebentar.", { parse_mode: "HTML" });

  const result = await createPakasirTopup({ userId, chatId, userName, nominal });

  if ("error" in result) {
    await bot.sendMessage(chatId, `❌ ${(/kosong|stok|habis/i.test(String(result.error ?? "")) ? "Stok sedang kosong. Coba produk lain." : /nomor|tujuan|invalid|dest/i.test(String(result.error ?? "")) ? "Nomor tujuan tidak valid." : "Transaksi gagal. Hubungi admin.")}`, { parse_mode: "HTML" });
    return;
  }

  const { order, qrisString } = result;
  const expiryMinutes = 5;

  let qrBuffer: Buffer;
  try {
    qrBuffer = await QRCode.toBuffer(qrisString, {
      errorCorrectionLevel: "M",
      width: 512,
      margin: 2,
    });
  } catch (err) {
    logger.error({ err }, "Failed to generate QR code from QRIS string");
    await bot.sendMessage(chatId, "❌ Gagal membuat gambar QR. Silakan coba lagi.", { parse_mode: "HTML" });
    return;
  }

  const caption =
    `<b>PROSES TOPUP QRIS</b>\n\n` +
    `• Nominal: <b>Rp ${order.nominal.toLocaleString("id-ID")}</b>\n` +
    `• Fee: <b>Rp ${order.fee.toLocaleString("id-ID")}</b>\n` +
    `• Total: <b>Rp ${order.total.toLocaleString("id-ID")}</b>\n` +
    `• Order ID: <code>${order.id}</code>\n` +
    `• Exp: <b>${expiryMinutes} Menit</b>\n\n` +
    `📌 <i>Terdapat fee 0.7% + 310, Untuk nominal di atas Rp 105.000 biayanya menjadi 1% + Rp 0.</i>\n\n` +
    `<i>Scan QR di atas menggunakan aplikasi pembayaran QRIS (GoPay, OVO, Dana, dll).</i>\n` +
    `Silakan bayar sebelum ${expiryMinutes} menit.`;

  const keyboard: TelegramBot.InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: "✅ SUDAH BAYAR", callback_data: `topup_paid_${order.id}` }],
    ],
  };

  await bot.sendPhoto(chatId, qrBuffer, {
    caption,
    parse_mode: "HTML",
    reply_markup: keyboard,
  });

  setTimeout(async () => {
    const t = getTopupById(order.id);
    if (t && t.status === "pending") {
      updateTopupStatus(order.id, "expired");
      try {
        await bot.sendMessage(
          chatId,
          `⏰ <b>Topup kadaluarsa</b>\n\nOrder <code>${order.id}</code> sudah kadaluarsa. Silakan topup ulang jika diperlukan.`,
          { parse_mode: "HTML" }
        );
      } catch { }
    }
  }, expiryMinutes * 60 * 1000);
}

export function setupHandlers(bot: TelegramBot) {
  // Map: admin forwarded msg ID → original user chatId (for reply routing)
  const adminReplyMap = new Map<number, number>();

  // ── Global rate-limit gate (registered first so it fires before all other listeners) ──
  bot.on("message", async (msg) => {
    if (!msg.from) return;
    // Blacklist check — blocked users get a polite refusal on every message
    if (isBlacklisted(msg.from.id)) {
      await bot.sendMessage(
        msg.chat.id,
        `🚫 <b>Akses Ditolak</b>\n\nAkun Anda telah diblokir dari layanan ini.\nHubungi admin jika ada kesalahan.`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      return;
    }
    if (isAdmin(msg.from.id)) return; // admins are exempt from rate limiting
    // Navigation buttons are not spam — don't count them against the rate limit
    if (msg.text && /^(🏠|💰|📦|📋|💳|📱|📢|💬)/.test(msg.text)) return;
    const { status, secondsLeft } = recordAndCheck(msg.from.id);
    if (status === "warn") {
      await bot.sendMessage(
        msg.chat.id,
        `⛔ <b>Terlalu cepat!</b>\n\nAnda mengirim pesan terlalu banyak. Silakan tunggu <b>${secondsLeft} detik</b> sebelum melanjutkan.`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }
  });

  bot.onText(/\/start/, async (msg) => {
    const from = msg.from!;
    const prevSession = getSession(from.id);
    const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);
    clearSession(from.id);
    if (prevSession.step === "chat_admin") {
      const userName = `${user.firstName}${user.lastName ? " " + user.lastName : ""}`;
      const adminIds = getAdminIds();
      for (const adminId of adminIds) {
        await bot.sendMessage(
          adminId,
          `ℹ️ <b>${userName}</b> (<code>${from.id}</code>) telah mengakhiri sesi chat.`,
          { parse_mode: "HTML" }
        ).catch(() => {});
      }
    }
    if (!user.whatsapp) {
      setSession(from.id, { step: "waiting_whatsapp" });
      await bot.sendMessage(
        msg.chat.id,
        `👋 Halo <b>${user.firstName}</b>!\n\nSelamat datang di bot kami.\n\nSebelum menggunakan layanan, mohon masukkan <b>nomor WhatsApp</b> Anda:\n\nContoh: <code>081234567890</code>`,
        { parse_mode: "HTML" }
      );
      return;
    }
    await bot.sendMessage(msg.chat.id, buildProfileText(user), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard({ isAdmin: isAdmin(from.id) }),
    });
  });

  // ── Admin: broadcast (via keyboard button OR /broadcast command) ──────────

  async function startBroadcastFlow(chatId: number, userId: number) {
    clearSession(userId);
    setSession(userId, { step: "waiting_broadcast_message" });
    await bot.sendMessage(
      chatId,
      `📢 <b>Mode Broadcast</b>\n\n` +
      `Kirim pesan yang ingin dibroadcast ke <b>semua user</b>.\n` +
      `Format HTML didukung: <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>, <code>&lt;code&gt;</code>\n\n` +
      `Kirim /cancel untuk membatalkan.`,
      { parse_mode: "HTML" }
    );
  }

  bot.onText(/📢 BROADCAST/, async (msg) => {
    const userId = msg.from!.id;
    if (!isAdmin(userId)) return;
    await startBroadcastFlow(msg.chat.id, userId);
  });

  bot.onText(/\/broadcast/, async (msg) => {
    const userId = msg.from!.id;
    if (!isAdmin(userId)) return;
    await startBroadcastFlow(msg.chat.id, userId);
  });

  bot.onText(/\/transfersaldo/, async (msg) => {
    const userId = msg.from!.id;
    if (!isAdmin(userId)) return;
    clearSession(userId);
    setSession(userId, { step: "waiting_transfer_userid" });
    await bot.sendMessage(
      msg.chat.id,
      `💸 <b>Transfer Saldo ke User</b>\n\nMasukkan <b>Telegram User ID</b> tujuan:\n<i>Ketik /cancel untuk membatalkan</i>`,
      { parse_mode: "HTML" }
    );
  });

  bot.onText(/\/cancel/, async (msg) => {
    const userId = msg.from!.id;
    if (!isAdmin(userId)) return;
    const session = getSession(userId);
    if (session.step === "waiting_broadcast_message" || session.step === "broadcast_confirm") {
      clearSession(userId);
      await bot.sendMessage(msg.chat.id, "❌ Broadcast dibatalkan.", { parse_mode: "HTML" });
    } else if (session.step === "waiting_admin_reply") {
      clearSession(userId);
      await bot.sendMessage(msg.chat.id, "❌ Mode balas dibatalkan.", { parse_mode: "HTML" });
    } else if (session.step === "waiting_transfer_userid" || session.step === "waiting_transfer_amount") {
      clearSession(userId);
      await bot.sendMessage(msg.chat.id, "❌ Transfer saldo dibatalkan.", { parse_mode: "HTML" });
    }
  });

  // ── Admin: /fixorders — list & cancel stuck processing orders ────────────

  bot.onText(/\/fixorders(?:\s+(.+))?/, async (msg, match) => {
    const userId = msg.from!.id;
    if (!isAdmin(userId)) return;

    const subCmd = (match?.[1] ?? "").trim().toLowerCase();
    const processingOrders = getAllOrders().filter((o) => o.status === "processing" || o.status === "paid" || o.status === "pending");

    if (subCmd === "cancel all" || subCmd === "cancelall") {
      if (processingOrders.length === 0) {
        await bot.sendMessage(msg.chat.id, "✅ Tidak ada order yang sedang diproses.", { parse_mode: "HTML" });
        return;
      }
      let cancelled = 0;
      let refunded = 0;
      for (const order of processingOrders) {
        updateOrderStatus(order.id, "cancelled");
        try {
          const updatedUser = await creditSaldoAtomic(order.userId, order.price, {
            type: "order_refund",
            refId: order.id,
            note: `Refund manual admin - order stuck: ${order.reffId}`,
          });
          refunded += order.price;
          const newSaldo = updatedUser?.saldo ?? (getUser(order.userId)?.saldo ?? 0);
          await bot.sendMessage(
            order.userId,
            `❌ <b>ORDER DIBATALKAN</b>\n\n` +
            `Paket: ${order.packageName}\n` +
            `Ref: <code>${order.reffId}</code>\n\n` +
            `💰 Saldo Rp ${order.price.toLocaleString("id-ID")} telah dikembalikan.\n` +
            `Saldo sekarang: <b>Rp ${newSaldo.toLocaleString("id-ID")}</b>`,
            { parse_mode: "HTML" }
          ).catch(() => {});
        } catch (e) {
          logger.error({ err: e, orderId: order.id }, "fixorders: refund failed");
        }
        cancelled++;
      }
      await bot.sendMessage(
        msg.chat.id,
        `✅ <b>Selesai!</b>\n\n${cancelled} order dibatalkan, total refund: Rp ${refunded.toLocaleString("id-ID")}`,
        { parse_mode: "HTML" }
      );
      return;
    }

    if (processingOrders.length === 0) {
      await bot.sendMessage(msg.chat.id, "✅ Tidak ada order yang sedang diproses.", { parse_mode: "HTML" });
      return;
    }

    const lines = processingOrders.map((o, i) => {
      const elapsed = Math.round((Date.now() - o.createdAt.getTime()) / 60000);
      return `${i + 1}. <code>${o.reffId}</code>\n   📦 ${o.packageName} | ${o.provider ?? "?"} | Rp ${o.price.toLocaleString("id-ID")}\n   ⏱ ${elapsed} menit lalu | status: ${o.status}`;
    }).join("\n\n");

    await bot.sendMessage(
      msg.chat.id,
      `⚙️ <b>Order Processing (${processingOrders.length})</b>\n\n${lines}\n\n` +
      `Kirim <code>/fixorders cancel all</code> untuk membatalkan semua dan refund saldo.`,
      { parse_mode: "HTML" }
    );
  });

  // ── Admin: /cekapi — test connectivity to all providers ─────────────────

  bot.onText(/\/cekapi/, async (msg) => {
    const userId = msg.from!.id;
    if (!isAdmin(userId)) return;

    await bot.sendMessage(msg.chat.id, "⏳ Mengecek koneksi ke semua provider...", { parse_mode: "HTML" });

    // Test DOPU
    let dopuStatus = "";
    try {
      const res = await getDopuBalance();
      if (res.balance !== null) {
        dopuStatus = `✅ OK — Saldo: <b>Rp ${res.balance.toLocaleString("id-ID")}</b>`;
      } else if (res.raw.startsWith("✅")) {
        dopuStatus = res.raw;
      } else if (res.raw.includes("diblokir") || res.raw.includes("Too many")) {
        dopuStatus = `❌ IP diblokir\n<code>${res.raw}</code>`;
      } else {
        dopuStatus = `⚠️ Terhubung, format tidak dikenali\n<code>${res.raw}</code>`;
      }
    } catch (e: any) {
      dopuStatus = `❌ Tidak terhubung: ${String(e?.message ?? e).slice(0, 80)}`;
    }

    // Test KHFY
    let khfyStatus = "";
    try {
      const res = await getKhfyBalance();
      if (res.balance !== null) {
        khfyStatus = `✅ OK — Saldo: <b>Rp ${res.balance.toLocaleString("id-ID")}</b>`;
      } else if (res.raw.startsWith("✅")) {
        khfyStatus = res.raw; // pre-formatted success message from ping test
      } else if (res.raw.startsWith("❌")) {
        khfyStatus = res.raw; // pre-formatted error from ping test
      } else {
        khfyStatus = `⚠️ Terhubung, format tidak dikenali\n<code>${res.raw}</code>`;
      }
    } catch (e: any) {
      khfyStatus = `❌ Tidak terhubung: ${String(e?.message ?? e).slice(0, 80)}`;
    }

    // Basic env check for Digiflazz
    const digiflazConfigured = !!(process.env.DIGIFLAZ_USERNAME && process.env.DIGIFLAZ_API_KEY);
    const digiflazStatus = digiflazConfigured
      ? `✅ Dikonfigurasi (username & API key tersedia)`
      : `⚠️ Belum dikonfigurasi (env var tidak ada)`;

    await bot.sendMessage(
      msg.chat.id,
      `🔌 <b>Status Koneksi Provider</b>\n\n` +
      `📡 <b>DOPU (Akrab V1 / Circle):</b>\n${dopuStatus}\n\n` +
      `📡 <b>KHFY (Akrab V2):</b>\n${khfyStatus}\n\n` +
      `📡 <b>Digiflazz:</b>\n${digiflazStatus}`,
      { parse_mode: "HTML" }
    );
  });

  // ── 🏠 Menu ──────────────────────────────────────────────────────────────

  bot.onText(/🏠 Menu/, async (msg) => {
    if (isBlocked(msg.from!.id)) return;
    const from = msg.from!;
    const prevSession = getSession(from.id);
    if (prevSession.step === "waiting_whatsapp") {
      await bot.sendMessage(msg.chat.id, `📱 <b>Daftarkan Nomor WhatsApp Anda</b>\n\nMasukkan nomor WhatsApp untuk melanjutkan.\n\nContoh: <code>081234567890</code>`, { parse_mode: 'HTML' });
      return;
    }
    const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);
    clearSession(from.id);
    if (prevSession.step === "chat_admin") {
      const userName = `${user.firstName}${user.lastName ? " " + user.lastName : ""}`;
      const adminIds = getAdminIds();
      for (const adminId of adminIds) {
        bot.sendMessage(
          adminId,
          `ℹ️ <b>${userName}</b> (<code>${from.id}</code>) telah mengakhiri sesi chat.`,
          { parse_mode: "HTML" }
        ).catch(() => {});
      }
    }
    await bot.sendMessage(msg.chat.id, buildProfileText(user), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard({ isAdmin: isAdmin(from.id) }),
    });
  });

  // ── 💬 CHAT ADMIN ─────────────────────────────────────────────────────────
  bot.onText(/\/chatadmin/, async (msg) => {
    if (isBlocked(msg.from!.id)) return;
    const from = msg.from!;
    if (isAdmin(from.id)) return; // admin tidak perlu chat diri sendiri
    const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);
    setSession(from.id, { step: "chat_admin" });

    await bot.sendMessage(
      msg.chat.id,
      `💬 <b>Mode Chat Admin</b>\n\n` +
      `Anda sekarang terhubung dengan admin.\n` +
      `Kirim pesan Anda dan admin akan membalasnya.\n\n` +
      `<i>Tekan 🏠 Menu atau /start untuk mengakhiri sesi chat.</i>`,
      { parse_mode: "HTML" }
    );

    // Notify admin
    const adminIds = getAdminIds();
    const userName = `${user.firstName}${user.lastName ? " " + user.lastName : ""}`;
    const userTag = user.username ? ` (@${user.username})` : "";
    for (const adminId of adminIds) {
      await bot.sendMessage(
        adminId,
        `💬 <b>User ingin chat</b>\n\n` +
        `👤 <b>${userName}</b>${userTag}\n` +
        `🆔 TG ID: <code>${from.id}</code>\n\n` +
        `<i>Balas pesan dari user di bawah ini untuk menghubungi mereka.</i>`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }
  });

  bot.onText(/\/order/, handleOrder(bot));
  bot.onText(/📦 ORDER/, handleOrder(bot));

  bot.onText(/💰 TOPUP/, async (msg) => {
    if (isBlocked(msg.from!.id)) return;
    const from = msg.from!;
    if (getSession(from.id).step === "waiting_whatsapp") {
      await bot.sendMessage(msg.chat.id, `📱 <b>Daftarkan Nomor WhatsApp Anda</b>\n\nMasukkan nomor WhatsApp untuk melanjutkan.\n\nContoh: <code>081234567890</code>`, { parse_mode: 'HTML' });
      return;
    }
    const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);
    setSession(from.id, { step: "waiting_topup_amount" });

    await bot.sendMessage(
      msg.chat.id,
      `💳 <b>TOPUP SALDO</b>\n\nSaldo Anda: <b>Rp ${user.saldo.toLocaleString("id-ID")}</b>\n\n` +
      `Silakan masukkan jumlah saldo yang ingin diisi.\nContoh: <code>10000</code>`,
      { parse_mode: "HTML" }
    );
  });

  // ── History helpers ─────────────────────────────────────────────────────────

  const HIST_PAGE_SIZE = 8;
  const HIST_6M_MS = 6 * 30 * 24 * 60 * 60 * 1000;

  function fmtHistDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const HH = String(d.getHours()).padStart(2, "0");
    const MM = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
  }

  function histPageKeyboard(
    type: "trx" | "saldo",
    currentPage: number,
    totalPages: number,
  ): TelegramBot.InlineKeyboardMarkup {
    const pageBtns: TelegramBot.InlineKeyboardButton[] = Array.from({ length: totalPages }, (_, i) => ({
      text: i === currentPage ? `☑️ ${i + 1}` : `${i + 1}`,
      callback_data: `hist_${type}_${i}`,
    }));

    const rows: TelegramBot.InlineKeyboardButton[][] = [];
    const row1: TelegramBot.InlineKeyboardButton[] = [];
    if (currentPage > 0) row1.push({ text: "Prev", callback_data: `hist_${type}_${currentPage - 1}` });
    row1.push(...pageBtns.slice(0, 4));
    rows.push(row1);

    const row2 = [...pageBtns.slice(4)];
    if (currentPage < totalPages - 1) row2.push({ text: "Next", callback_data: `hist_${type}_${currentPage + 1}` });
    if (row2.length > 0) rows.push(row2);

    return { inline_keyboard: rows };
  }

  function buildTrxPage(userId: number, page: number): { text: string; keyboard: TelegramBot.InlineKeyboardMarkup } {
    const cutoff = new Date(Date.now() - HIST_6M_MS);
    const items = getOrdersByUser(userId).filter(
      o => o.status === "done" && new Date(o.createdAt) >= cutoff
    );
    const totalPages = Math.max(1, Math.ceil(items.length / HIST_PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const slice = items.slice(safePage * HIST_PAGE_SIZE, (safePage + 1) * HIST_PAGE_SIZE);

    let text = `📋 <b>Riwayat transaksi ${safePage + 1} of ${totalPages}</b>\n`;
    if (slice.length === 0) {
      text += "\nBelum ada transaksi sukses dalam 6 bulan terakhir.";
    } else {
      slice.forEach(o => {
        text +=
          `\nOrder ID : <code>${o.id}</code>\n` +
          `Produk : ${o.packageName}\n` +
          `Harga : Rp${o.price.toLocaleString("id-ID")}\n` +
          `Tanggal : — ${fmtHistDate(new Date(o.createdAt))}\n` +
          `Status : → success\n`;
      });
    }
    return { text, keyboard: histPageKeyboard("trx", safePage, totalPages) };
  }

  function buildSaldoPage(userId: number, page: number): { text: string; keyboard: TelegramBot.InlineKeyboardMarkup } {
    const cutoff = new Date(Date.now() - HIST_6M_MS);

    type SaldoEntry = { label: string; date: Date };
    const entries: SaldoEntry[] = [];

    // Topup masuk
    getTopupsByUser(userId).forEach(t => {
      if (new Date(t.createdAt) >= cutoff) {
        entries.push({
          label: `+ Rp${t.nominal.toLocaleString("id-ID")} (Topup Saldo)\nTanggal : — ${fmtHistDate(new Date(t.createdAt))}`,
          date: new Date(t.createdAt),
        });
      }
    });

    // Saldo keluar (order via saldo)
    getOrdersByUser(userId).filter(o => o.paymentMethod === "saldo" && new Date(o.createdAt) >= cutoff).forEach(o => {
      const label = o.status === "cancelled"
        ? `+ Rp${o.price.toLocaleString("id-ID")} (Refund: ${o.packageName})\nTanggal : — ${fmtHistDate(new Date(o.createdAt))}`
        : `- Rp${o.price.toLocaleString("id-ID")} → ${o.packageName}\nTanggal : — ${fmtHistDate(new Date(o.createdAt))}`;
      entries.push({ label, date: new Date(o.createdAt) });
    });

    entries.sort((a, b) => b.date.getTime() - a.date.getTime());

    const totalPages = Math.max(1, Math.ceil(entries.length / HIST_PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const slice = entries.slice(safePage * HIST_PAGE_SIZE, (safePage + 1) * HIST_PAGE_SIZE);

    let text = `💰 <b>Riwayat saldo ${safePage + 1} of ${totalPages}</b>\n`;
    if (slice.length === 0) {
      text += "\nBelum ada riwayat penggunaan saldo dalam 6 bulan terakhir.";
    } else {
      slice.forEach(e => { text += `\n${e.label}\n`; });
    }
    return { text, keyboard: histPageKeyboard("saldo", safePage, totalPages) };
  }

  // ── RIWAYAT button ────────────────────────────────────────────────────────

  bot.onText(/📋 RIWAYAT/, async (msg) => {
    if (isBlocked(msg.from!.id)) return;
    if (getSession(msg.from!.id).step === "waiting_whatsapp") {
      await bot.sendMessage(msg.chat.id, `📱 <b>Daftarkan Nomor WhatsApp Anda</b>\n\nMasukkan nomor WhatsApp untuk melanjutkan.\n\nContoh: <code>081234567890</code>`, { parse_mode: 'HTML' });
      return;
    }
    await bot.sendMessage(
      msg.chat.id,
      "📋 <b>RIWAYAT</b>\n\nRiwayat transaksi dan saldo 6 bulan terakhir masih bisa di akses",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "📦 Transaksi", callback_data: "hist_trx_0" },
            { text: "💰 Saldo", callback_data: "hist_saldo_0" },
          ]],
        },
      }
    );
  });

  bot.on("message", async (msg) => {
    if (!msg.text) return;
    // Skip messages handled by dedicated onText/command handlers to avoid double-processing
    if (/^\/|🏠|💰|📦|📋|💳|📱|📢|💬/.test(msg.text)) return;
    const from = msg.from!;
    const session = getSession(from.id);

    // ── Admin in waiting_admin_reply mode: relay next typed message to target user ──
    if (isAdmin(from.id) && session.step === "waiting_admin_reply") {
      const targetUserId = session.replyTargetUserId;
      if (targetUserId) {
        const replyText = msg.text ?? "";
        if (replyText) {
          await bot.sendMessage(
            targetUserId,
            `💬 <b>Pesan dari Admin:</b>\n\n${replyText}`,
            { parse_mode: "HTML" }
          ).catch(() => {});
          await bot.sendMessage(
            msg.chat.id,
            `✅ Pesan terkirim ke user.`,
            { parse_mode: "HTML" }
          ).catch(() => {});
        }
      }
      clearSession(from.id);
      return;
    }

    // ── Admin reply relay: if admin replies to a forwarded chat message, send it back to the user ──
    if (isAdmin(from.id) && msg.reply_to_message) {
      const replyToId = msg.reply_to_message.message_id;
      const targetChatId = adminReplyMap.get(replyToId);
      if (targetChatId) {
        const replyText = msg.text ?? "";
        if (replyText) {
          await bot.sendMessage(
            targetChatId,
            `💬 <b>Pesan dari Admin:</b>\n\n${replyText}`,
            { parse_mode: "HTML" }
          ).catch(() => {});
          await bot.sendMessage(
            msg.chat.id,
            `✅ Pesan terkirim ke user.`,
            { parse_mode: "HTML" }
          ).catch(() => {});
        }
        return;
      }
    }

    if (session.step === "chat_admin" && !isAdmin(from.id)) {
      const userText = msg.text ?? "";
      if (!userText) return;
      const user = getUser(from.id);
      const userName = user ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}` : String(from.id);
      const userTag = user?.username ? ` (@${user.username})` : "";
      const adminIds = getAdminIds();
      for (const adminId of adminIds) {
        try {
          const forwarded = await bot.sendMessage(
            adminId,
            `💬 <b>Pesan dari ${userName}</b>${userTag}\n` +
            `🆔 <code>${from.id}</code>\n\n` +
            `${userText}`,
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [[
                  { text: "💬 Balas Chat", callback_data: `reply_chat_${from.id}` },
                ]],
              },
            }
          );
          // Map forwarded message ID → user chatId so Telegram-reply routing still works
          adminReplyMap.set(forwarded.message_id, msg.chat.id);
        } catch { }
      }
      return;
    }

    if (session.step === "waiting_transfer_userid" && isAdmin(from.id)) {
      const raw = msg.text.trim();
      const targetId = parseInt(raw, 10);
      if (isNaN(targetId) || targetId <= 0) {
        await bot.sendMessage(msg.chat.id, "❌ User ID tidak valid. Masukkan angka Telegram User ID yang benar:", { parse_mode: "HTML" });
        return;
      }
      const targetUser = getUser(targetId);
      if (!targetUser) {
        await bot.sendMessage(msg.chat.id, `❌ User dengan ID <code>${targetId}</code> tidak ditemukan di sistem.\nPastikan user sudah pernah membuka bot.`, { parse_mode: "HTML" });
        return;
      }
      setSession(from.id, { step: "waiting_transfer_amount", transferTargetId: targetId });
      const displayName = [targetUser.firstName, targetUser.lastName].filter(Boolean).join(" ");
      await bot.sendMessage(
        msg.chat.id,
        `👤 User ditemukan: <b>${displayName}</b> (@${targetUser.username ?? "-"})\n` +
        `💰 Saldo saat ini: <b>Rp ${targetUser.saldo.toLocaleString("id-ID")}</b>\n\n` +
        `Masukkan nominal saldo:\n• Positif untuk <b>tambah</b> (contoh: <code>50000</code>)\n• Negatif untuk <b>kurangi</b> (contoh: <code>-25000</code>)\n\n<i>Ketik /cancel untuk membatalkan</i>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    if (session.step === "waiting_transfer_amount" && isAdmin(from.id)) {
      const targetId = session.transferTargetId;
      if (!targetId) { clearSession(from.id); return; }
      const raw = msg.text.trim();
      const amount = parseInt(raw, 10);
      if (isNaN(amount) || amount === 0) {
        await bot.sendMessage(msg.chat.id, "❌ Nominal tidak valid. Masukkan angka (positif atau negatif):", { parse_mode: "HTML" });
        return;
      }
      const targetUser = getUser(targetId);
      if (!targetUser) {
        clearSession(from.id);
        await bot.sendMessage(msg.chat.id, "❌ User tidak ditemukan.", { parse_mode: "HTML" });
        return;
      }
      const saldoBefore = targetUser.saldo;
      const logType = amount >= 0 ? "admin_credit" : "admin_deduct";
      const updated = updateSaldo(targetId, amount, { type: logType, note: `Transfer by admin ${from.id}` });
      clearSession(from.id);
      if (!updated) {
        await bot.sendMessage(msg.chat.id, "❌ Gagal memperbarui saldo.", { parse_mode: "HTML" });
        return;
      }
      const label = amount > 0
        ? `+Rp ${amount.toLocaleString("id-ID")}`
        : `-Rp ${Math.abs(amount).toLocaleString("id-ID")}`;
      const displayName = [targetUser.firstName, targetUser.lastName].filter(Boolean).join(" ");
      await bot.sendMessage(
        msg.chat.id,
        `✅ <b>Transfer Berhasil!</b>\n\n` +
        `👤 User: <b>${displayName}</b> (<code>${targetId}</code>)\n` +
        `💸 Nominal: <b>${label}</b>\n` +
        `📊 Saldo sebelum: Rp ${saldoBefore.toLocaleString("id-ID")}\n` +
        `📊 Saldo sesudah: Rp ${updated.saldo.toLocaleString("id-ID")}`,
        { parse_mode: "HTML" }
      );
      // Notify target user
      bot.sendMessage(
        targetId,
        amount > 0
          ? `💰 <b>Saldo Ditambahkan!</b>\n\nAdmin menambahkan <b>Rp ${amount.toLocaleString("id-ID")}</b> ke saldo Anda.\nSaldo sekarang: <b>Rp ${updated.saldo.toLocaleString("id-ID")}</b>`
          : `💰 <b>Saldo Dikurangi</b>\n\nAdmin mengurangi <b>Rp ${Math.abs(amount).toLocaleString("id-ID")}</b> dari saldo Anda.\nSaldo sekarang: <b>Rp ${updated.saldo.toLocaleString("id-ID")}</b>`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      return;
    }

    if (session.step === "waiting_broadcast_message" && isAdmin(from.id)) {
      const bcastMsg = msg.text.trim();
      if (!bcastMsg || bcastMsg.length === 0) return;
      const totalUsers = getAllUsers().length;
      setSession(from.id, { step: "broadcast_confirm", broadcastMessage: bcastMsg });
      await bot.sendMessage(
        msg.chat.id,
        `📢 <b>Preview Broadcast</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${bcastMsg}\n\n━━━━━━━━━━━━━━━━━━━━\n` +
        `Pesan ini akan dikirim ke <b>${totalUsers} pengguna</b>.\nLanjutkan?`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[
              { text: `✅ Kirim ke ${totalUsers} user`, callback_data: "bcast_confirm" },
              { text: "❌ Batalkan", callback_data: "bcast_cancel" },
            ]],
          },
        }
      );
      return;
    }

    if (session.step === "waiting_whatsapp") {
      const wa = msg.text.trim().replace(/\s+/g, "").replace(/^(\+62|62)/, "0");
      if (!/^0\d{8,13}$/.test(wa)) {
        await bot.sendMessage(
          msg.chat.id,
          "❌ Format nomor WhatsApp tidak valid.\nMasukkan nomor yang benar.\nContoh: <code>081234567890</code>",
          { parse_mode: "HTML" }
        );
        return;
      }
      const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);
      setWhatsapp(from.id, wa);
      clearSession(from.id);
      const updatedUser = { ...user, whatsapp: wa };
      await bot.sendMessage(
        msg.chat.id,
        `✅ <b>Pendaftaran Berhasil!</b>\n\nNomor WhatsApp <code>${wa}</code> telah tersimpan.\n\n` +
        buildProfileText(updatedUser),
        {
          parse_mode: "HTML",
          reply_markup: mainMenuKeyboard({ isAdmin: isAdmin(from.id) }),
        }
      );
      return;
    }

    if (session.step === "waiting_nomor_tujuan") {
      const nomor = msg.text.trim().replace(/\s+/g, "");
      if (!/^0\d{8,13}$/.test(nomor)) {
        await bot.sendMessage(
          msg.chat.id,
          "❌ Format nomor tidak valid.\nMasukkan nomor HP yang benar.\nContoh: <code>081234567890</code>",
          { parse_mode: "HTML" }
        );
        return;
      }

      const user = getUser(from.id);
      const price = session.selectedPackagePrice ?? 0;
      setSession(from.id, { step: "select_payment", selectedNomorTujuan: nomor });

      const confirmText =
        `⚠️ <b>KONFIRMASI PESANAN</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `• Produk: <b>${session.selectedPackageName ?? "-"}</b>\n` +
        `• Nomor: <code>${nomor}</code>\n` +
        `• Harga: <b>Rp ${price.toLocaleString("id-ID")}</b>\n\n` +
        `• Saldo Anda: <b>Rp ${(user?.saldo ?? 0).toLocaleString("id-ID")}</b>\n\n` +
        `Pilih Metode Pembayaran:`;

      const sent = await bot.sendMessage(msg.chat.id, confirmText, {
        parse_mode: "HTML",
        reply_markup: paymentMethodKeyboard(),
      });
      setSession(from.id, { paymentMsgId: sent.message_id });
      return;
    }

    if ((session.step as string) === "po_waiting_nomor") {
      const nomor = msg.text.trim().replace(/\s+/g, "");
      if (!/^0\d{8,13}$/.test(nomor)) {
        await bot.sendMessage(
          msg.chat.id,
          `❌ Nomor tidak valid.\n\nMasukkan nomor yang benar.\nContoh: <code>081234567890</code>`,
          { parse_mode: "HTML" }
        );
        return;
      }
      const price = session.selectedPackagePrice ?? 0;
      const packageName = session.selectedPackageName ?? "";
      const sku = (session as any).preorderPackageSku as string ?? "";
      setSession(from.id, {
        ...(session as any),
        poNomor: nomor,
      });
      await bot.sendMessage(
        msg.chat.id,
        `⏳ <b>KONFIRMASI PRE ORDER</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📦 Produk : <b>${packageName}</b>\n` +
        `📱 Nomor : <code>${nomor}</code>\n` +
        `💰 Harga : <b>Rp ${price.toLocaleString("id-ID")}</b>\n\n` +
        `Dana akan diproses saat pesanan selesai.\n` +
        `Stok akan dicek otomatis setiap 3 menit.`,
        {
          parse_mode: "HTML",
          reply_markup: preOrderPaymentKeyboard(),
        }
      );
      return;
    }

    if (session.step === "waiting_topup_amount") {
      const text = msg.text.trim().replace(/[.,]/g, "");
      const nominal = parseInt(text, 10);

      if (isNaN(nominal) || nominal < 1000) {
        await bot.sendMessage(
          msg.chat.id,
          "❌ Nominal tidak valid. Masukkan angka minimal <b>Rp 1.000</b>.\nContoh: <code>10000</code>",
          { parse_mode: "HTML" }
        );
        return;
      }

      clearSession(from.id);
      await sendTopupQR(bot, msg.chat.id, from.id, nominal);
    }
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id;
    const messageId = query.message?.message_id;
    const userId = query.from.id;
    const data = query.data ?? "";

    if (!chatId || !messageId) return;

    // Blacklist check
    if (isBlacklisted(userId)) {
      await bot.answerCallbackQuery(query.id, {
        text: "🚫 Akun Anda telah diblokir dari layanan ini.",
        show_alert: true,
      }).catch(() => {});
      return;
    }

    // ── Rate limit check for inline button presses (admins exempt) ──────────
    if (!isAdmin(userId)) {
      const rl = recordAndCheck(userId);
      if (rl.status === "warn") {
        await bot.answerCallbackQuery(query.id, {
          text: `⛔ Terlalu cepat! Tunggu ${rl.secondsLeft} detik.`,
          show_alert: true,
        }).catch(() => {});
        return;
      }
      if (rl.status === "blocked") {
        await bot.answerCallbackQuery(query.id, {
          text: `⏳ Tunggu ${rl.secondsLeft} detik sebelum melanjutkan.`,
          show_alert: false,
        }).catch(() => {});
        return;
      }
    }

    // ── Admin: Balas Chat button ──────────────────────────────────────────────
    if (data.startsWith("reply_chat_") && isAdmin(userId)) {
      const targetUserId = parseInt(data.replace("reply_chat_", ""), 10);
      if (!isNaN(targetUserId)) {
        setSession(userId, { step: "waiting_admin_reply", replyTargetUserId: targetUserId });
        await bot.answerCallbackQuery(query.id).catch(() => {});
        await bot.sendMessage(
          chatId,
          `✏️ <b>Mode Balas</b>\n\nKetik balasan Anda untuk user <code>${targetUserId}</code>.\nPesan berikutnya akan langsung dikirim ke user.\n\n<i>Kirim /cancel untuk membatalkan.</i>`,
          { parse_mode: "HTML" }
        );
      } else {
        await bot.answerCallbackQuery(query.id, { text: "ID user tidak valid.", show_alert: true }).catch(() => {});
      }
      return;
    }

    if (data.startsWith("topup_paid_")) {
      const topupId = data.replace("topup_paid_", "");
      const topup = getTopupById(topupId);

      if (!topup) {
        await bot.answerCallbackQuery(query.id, { text: "⚠️ Order tidak ditemukan.", show_alert: true }).catch(() => {});
        return;
      }
      if (topup.status === "expired") {
        await bot.answerCallbackQuery(query.id, { text: "⏰ Order sudah kadaluarsa.", show_alert: true }).catch(() => {});
        return;
      }
      // Already completed (e.g. webhook already fired)
      if (topup.status === "completed") {
        const alreadyMsg = topup.orderPayload
          ? "✅ Order sudah diproses!"
          : "✅ Saldo sudah ditambahkan!";
        await bot.answerCallbackQuery(query.id, { text: alreadyMsg, show_alert: true }).catch(() => {});
        return;
      }

      // Answer immediately so button spinner clears, then check Pakasir
      await bot.answerCallbackQuery(query.id, { text: "🔄 Memeriksa pembayaran..." }).catch(() => {});

      // Single instant check — no polling
      const pakasirStatus = await checkPakasirStatus(topupId).catch(() => null);
      logger.info({ topupId, pakasirStatus }, "Pakasir status check after SUDAH BAYAR");

      // Match common Pakasir status values including Indonesian terms
      const isPaid = pakasirStatus != null && /paid|completed|settlement|success|sukses|lunas|berhasil|^1$/i.test(String(pakasirStatus));

      if (isPaid) {
        updateTopupStatus(topupId, "completed");

        // --- ORDER payment via QRIS (has orderPayload) ---
        if (topup.orderPayload) {
          const { sku, nomorTujuan, packageName, category, packageId, quota, validity, source } = topup.orderPayload;

          // Manual package (no SKU) — notify admin to process manually
          if (!sku || source === "manual") {
            const adminIds = (process.env.ADMIN_TELEGRAM_IDS ?? "")
              .split(",").map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n));
            createOrder({
              userId: topup.userId,
              userName: topup.userName ?? "",
              category: category as any,
              packageId,
              packageName,
              price: topup.nominal,
              baseprice: topup.nominal,
              quota,
              validity,
              nomorTujuan,
              reffId: topupId,
              paymentMethod: "qris",
            });
            for (const adminId of adminIds) {
              bot.sendMessage(
                adminId,
                `🔔 <b>ORDER MANUAL MASUK (QRIS)</b>\n\n` +
                `👤 User: <code>${topup.userId}</code>\n` +
                `📦 Paket: <b>${packageName}</b>\n` +
                `📱 Nomor: <code>${nomorTujuan}</code>\n` +
                `💰 Bayar: <b>Rp ${topup.nominal.toLocaleString("id-ID")}</b>\n` +
                `🔖 Order ID: <code>${topupId}</code>\n\n` +
                `⚠️ Proses order ini secara manual.`,
                { parse_mode: "HTML" }
              ).catch(() => {});
            }
            await bot.editMessageCaption(
              `✅ <b>PEMBAYARAN DITERIMA</b>\n\n` +
              `Pembayaran untuk paket <b>${packageName}</b> ke nomor <code>${nomorTujuan}</code> telah diterima.\n\n` +
              `⏳ Admin akan memproses order Anda segera. Mohon tunggu konfirmasi.\n\n` +
              `💬 Hubungi @${SUPPORT_USERNAME} jika ada pertanyaan.`,
              { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
            ).catch(async () => {
              await bot.sendMessage(
                chatId,
                `✅ <b>PEMBAYARAN DITERIMA</b>\n\nPaket <b>${packageName}</b> → <code>${nomorTujuan}</code>\n\nAdmin akan proses segera.`,
                { parse_mode: "HTML" }
              );
            });
            return;
          }

          // Auto-process via provider API
          const { randomUUID } = await import("crypto");
          const refId = randomUUID().replace(/-/g, "").slice(0, 20);
          const useDigiflaz = source === "digiflaz";
          const useDopu = !useDigiflaz && (category === "akrab1" || category === "circle");

          await bot.editMessageCaption(
            `⏳ <b>Memproses order...</b>\n\n📦 <b>${packageName}</b>\n📱 <code>${nomorTujuan}</code>`,
            { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
          ).catch(() => {});

          const result = useDigiflaz
            ? await placeDigiflazOrder({ sku, tujuan: nomorTujuan, refId })
            : useDopu
              ? await placeDopuOrder({ sku, tujuan: nomorTujuan, reffId: refId })
              : await placeKhfyOrder({ sku, tujuan: nomorTujuan, reffId });

          const dopuResult = useDopu ? (result as DopuOrderResult) : null;
          const digiflazResultQ = useDigiflaz ? (result as DigiflazOrderResult) : null;
          const providerRef = dopuResult?.reffId ?? digiflazResultQ?.refId ?? refId;
          const isPending = (dopuResult && result.success ? (result as any).pending === true : false)
            || (digiflazResultQ && result.success ? (result as any).pending === true : false);

          if (result.success) {
            const sn = result.sn;
            const newOrder = createOrder({
              userId: topup.userId,
              userName: topup.userName ?? "",
              category: category as any,
              packageId,
              packageName,
              price: topup.nominal,
              baseprice: topup.nominal,
              quota,
              validity,
              nomorTujuan,
              sn: sn || undefined,
              reffId: preReffId,
              paymentMethod: "qris",
              provider: useDigiflaz ? "digiflaz" : useDopu ? "dopu" : "khfy",
            });

            // Update order status: "processing" for async, "done" for sync (KHFY)
            updateOrderStatus(newOrder.id, isPending ? "processing" : "done", sn || undefined);

            // Start polling for async pending orders (DOPU / Digiflaz)
            if (isPending && (useDopu || useDigiflaz) && providerRef) {
              const dopuTrxId = useDopu ? (sn || undefined) : undefined;
              startOrderPolling(bot, newOrder, {
                provider: useDigiflaz ? "digiflaz" : "dopu",
                dopuTrxId,
                delayMs: useDigiflaz ? 20 * 1000 : 60 * 1000,
              });
            }

            if (isPending) {
              const circleNote = category === "circle" && !useDigiflaz
                ? `\n\n📱 Buka aplikasi MyXL → konfirmasi undangan Circle yang masuk ke nomor tujuan.`
                : "";
              await bot.editMessageCaption(
                `⚙️ <b>ORDER SEDANG DIPROSES</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `🔖 Order ID  : <code>${newOrder.id}</code>\n` +
                `📦 Produk: <b>${packageName}</b>\n` +
                `📱 Nomor: <code>${nomorTujuan}</code>\n` +
                `💰 Harga: <b>Rp ${topup.nominal.toLocaleString("id-ID")}</b>\n` +
                (sn ? `🔑 No. Trx: <code>${sn}</code>\n` : "") +
                `\n⏳ <i>Paket sedang diproses. Jika dalam 30 menit tidak masuk, hubungi admin.</i>` +
                circleNote,
                { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
              ).catch(async () => {
                await bot.sendMessage(
                  chatId,
                  `⚙️ <b>ORDER SEDANG DIPROSES</b>\n\n📦 <b>${packageName}</b>\n📱 <code>${nomorTujuan}</code>\n\n⏳ Paket sedang diproses. Hubungi admin jika dalam 30 menit belum masuk.`,
                  { parse_mode: "HTML" }
                );
              });
            } else {
              // KHFY — handle result langsung
              const khfyTrxId = (result as any).trxid || sn || undefined;
              if (!khfyTrxId && sn) {
                // Langsung sukses
                updateOrderStatus(pendingOrder.id, "done", sn);
                const _n = new Date();
                const _tgl = _n.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
                const _jam = _n.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
                await bot.editMessageText(
                  `✅ <b>ORDER BERHASIL !</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━\n` +
                  `🔖 Order ID : <code>${pendingOrder.id}</code>\n` +
                  `📦 Produk : <b>${session.selectedPackageName ?? sku}</b>\n` +
                  `📱 Target : <code>${nomor}</code>\n` +
                  `💰 Harga : <b>Rp ${price.toLocaleString("id-ID")}</b>\n` +
                  `📅 Date  : ${_tgl}\n\nJam Sukses : ${_jam} WIB\n\nTerimakasih sudah berbelanja ☺️☺️`,
                  { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
                ).catch(() => {});
              } else {
                // Pending — mulai polling
                updateOrderStatus(pendingOrder.id, "processing", khfyTrxId);
                await bot.editMessageText(
                  `⚙️ <b>ORDER SEDANG DIPROSES</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n\n` +
                  `🔖 Order ID  : <code>${pendingOrder.id}</code>\n` +
                  `📦 Produk: <b>${session.selectedPackageName ?? sku}</b>\n` +
                  `📱 Nomor: <code>${nomor}</code>\n` +
                  `💰 Harga: <b>Rp ${price.toLocaleString("id-ID")}</b>\n` +
                  `\n⏳ <i>Paket sedang diproses. Notifikasi otomatis akan dikirim.</i>`,
                  { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
                ).catch(() => {});
                startOrderPolling(bot, pendingOrder, { provider: "khfy", khfyTrxId, delayMs: 5000 });
              }
            }
            const refunded = await creditSaldoAtomic(topup.userId, topup.nominal, {
              type: "order_refund",
              refId: topupId,
              note: `Refund order QRIS gagal: ${result.error ?? ""}`,
            });
            await bot.editMessageCaption(
              `❌ <b>ORDER GAGAL</b>\n\n⚠️ ${(/kosong|stok|habis/i.test(String(result.error ?? "")) ? "Stok sedang kosong. Coba produk lain." : /nomor|tujuan|invalid|dest/i.test(String(result.error ?? "")) ? "Nomor tujuan tidak valid." : "Transaksi gagal. Hubungi admin.")}\n\n` +
              `💰 Rp ${topup.nominal.toLocaleString("id-ID")} telah dikembalikan ke saldo.\n` +
              `Saldo sekarang: <b>Rp ${(refunded?.saldo ?? 0).toLocaleString("id-ID")}</b>`,
              { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
            ).catch(async () => {
              await bot.sendMessage(
                chatId,
                `❌ <b>ORDER GAGAL</b>\n\n${(/kosong|stok|habis/i.test(String(result.error ?? "")) ? "Stok sedang kosong. Coba produk lain." : /nomor|tujuan|invalid|dest/i.test(String(result.error ?? "")) ? "Nomor tujuan tidak valid." : "Transaksi gagal. Hubungi admin.")}\n\n💰 Saldo Rp ${topup.nominal.toLocaleString("id-ID")} dikembalikan.`,
                { parse_mode: "HTML" }
              );
            });
          }
          return;
        }

        // --- Regular saldo topup ---
        const updatedUser = await creditSaldoAtomic(topup.userId, topup.nominal, {
          type: "topup",
          refId: topupId,
          note: `QRIS topup Rp${topup.nominal.toLocaleString("id-ID")} via konfirmasi manual`,
        });

        await bot.editMessageCaption(
          `✅ <b>TOPUP BERHASIL!</b>\n\n` +
          `• Order ID: <code>${topup.id}</code>\n` +
          `• Nominal: <b>Rp ${topup.nominal.toLocaleString("id-ID")}</b>\n` +
          `• Saldo sekarang: <b>Rp ${(updatedUser?.saldo ?? 0).toLocaleString("id-ID")}</b>`,
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
        ).catch(async () => {
          await bot.sendMessage(
            chatId,
            `✅ <b>TOPUP BERHASIL!</b>\n\n` +
            `• Nominal: <b>Rp ${topup.nominal.toLocaleString("id-ID")}</b>\n` +
            `• Saldo sekarang: <b>Rp ${(updatedUser?.saldo ?? 0).toLocaleString("id-ID")}</b>`,
            { parse_mode: "HTML" }
          );
        });
      } else {
        // Second answerCallbackQuery won't work (already answered above), so send a message instead
        await bot.sendMessage(
          chatId,
          `❌ <b>Pembayaran belum terdeteksi</b>\n\n` +
          `Status: <code>${pakasirStatus ?? "tidak diketahui"}</code>\n\n` +
          `Jika sudah bayar, silakan tunggu beberapa saat dan coba tekan tombol lagi.\n` +
          `Atau hubungi admin: @${SUPPORT_USERNAME}`,
          { parse_mode: "HTML" }
        ).catch(() => {});
      }
      return;
    }

    if (data === "refresh_stock") {
      const session = getSession(userId);
      const category = session.category as Category | undefined;
      const categoryLabels: Record<Category, string> = { akrab1: "AKRAB 1", akrab2: "AKRAB 2", circle: "CIRCLE", preorder: "PRE ORDER" };

      await bot.answerCallbackQuery(query.id, { text: "🔄 Memperbarui stok..." });

      try {
        await refreshAllPackages();
        const packages = category ? getPackagesWithMarkup(category) : [];
        const label = category ? categoryLabels[category] : "Paket";
        try {
          await bot.editMessageText(
            `📦 <b>PAKET ${label}</b>\n\nPilih paket yang Anda inginkan:`,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: "HTML",
              reply_markup: packageInlineKeyboard(packages, session.page ?? 0, category ? pkgKeyboardOpts(category, packages) : {}),
            }
          );
        } catch (editErr: any) {
          // Telegram 400 "message not modified" — stok tidak berubah, bukan error serius
          if (editErr?.response?.statusCode === 400 || String(editErr?.message ?? "").includes("not modified")) {
            await bot.answerCallbackQuery(query.id, { text: "✅ Stok sudah terkini" });
          } else {
            throw editErr;
          }
        }
      } catch (err) {
        logger.error({ err }, "Failed to refresh stock");
        await bot.answerCallbackQuery(query.id, { text: "❌ Gagal refresh. Coba lagi." }).catch(() => {});
      }
      return;
    }

    if (data === "back_category") {
      try { await bot.answerCallbackQuery(query.id); } catch { }
      setSession(userId, { step: "select_category", category: undefined, packageId: undefined });
      await bot.editMessageText("📦 <b>PILIH KATEGORI</b>\n\nSilakan pilih kategori paket yang tersedia:", {
        chat_id: chatId, message_id: messageId, parse_mode: "HTML",
        reply_markup: categoryInlineKeyboard(),
      });
      return;
    }
    if (data === "cancel_order") {
      try { await bot.answerCallbackQuery(query.id); } catch { }
      clearSession(userId);
      await bot.editMessageText("❌ Order dibatalkan.\n\nKetik /order untuk memulai order baru.", {
        chat_id: chatId, message_id: messageId,
      });
      return;
    }

    // ── Admin broadcast callbacks ─────────────────────────────────────────
    if (data === "bcast_confirm" || data === "bcast_cancel") {
      try { await bot.answerCallbackQuery(query.id); } catch { }

      if (!isAdmin(userId)) {
        try { await bot.editMessageText("❌ Bukan admin.", { chat_id: chatId, message_id: messageId }); } catch { }
        return;
      }

      if (data === "bcast_cancel") {
        clearSession(userId);
        try {
          await bot.editMessageText("❌ <b>Broadcast dibatalkan.</b>", { chat_id: chatId, message_id: messageId, parse_mode: "HTML" });
        } catch { }
        return;
      }

      const session = getSession(userId);
      const bcastMsg = session.broadcastMessage;
      if (!bcastMsg) {
        try { await bot.editMessageText("❌ Pesan broadcast tidak ditemukan.", { chat_id: chatId, message_id: messageId }); } catch { }
        return;
      }

      clearSession(userId);
      const totalUsers = getAllUsers().length;

      try {
        await bot.editMessageText(
          `⏳ <b>Mengirim broadcast...</b>\n\nMengirim ke <b>${totalUsers} user</b>. Mohon tunggu.`,
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
        );
      } catch { }

      const { sent, failed } = await doBroadcast(bot, bcastMsg);

      try {
        await bot.editMessageText(
          `✅ <b>Broadcast Selesai!</b>\n\n` +
          `👥 Total user: <b>${totalUsers}</b>\n` +
          `✅ Terkirim: <b>${sent}</b>\n` +
          `❌ Gagal: <b>${failed}</b>`,
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
        );
      } catch { }
      return;
    }

    // ── History pagination callbacks ────────────────────────────────────────
    if (data.startsWith("hist_trx_") || data.startsWith("hist_saldo_")) {
      try { await bot.answerCallbackQuery(query.id); } catch { }
      const isTrx = data.startsWith("hist_trx_");
      const page = parseInt(data.split("_").pop() ?? "0", 10);
      const { text, keyboard } = isTrx
        ? buildTrxPage(userId, page)
        : buildSaldoPage(userId, page);
      try {
        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
      } catch { }
      return;
    }

    // Answer all other callbacks generically (topup_paid_ and refresh_stock answer themselves above)
    try { await bot.answerCallbackQuery(query.id); } catch { }

    // ── PRE ORDER: pilih kategori ─────────────────────────────────────────
    if (data === "cat_preorder") {
      const packages = getPackagesWithMarkup("preorder");
      setSession(userId, { step: "po_select_package" as any });
      if (packages.length === 0) {
        await bot.editMessageText(
          `⏳ <b>PRE ORDER</b>\n\n⚠️ Belum ada paket tersedia. Hubungi admin @${SUPPORT_USERNAME}`,
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: backToCategoryKeyboard() }
        );
        return;
      }
      await bot.editMessageText(
        `⏳ <b>PRE ORDER — Pilih Paket</b>\n\nPaket akan otomatis di proses jika stock tersedia.\n\nPilih paket:`,
        { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: preOrderPackageKeyboard(packages) }
      );
      return;
    }

    // ── PRE ORDER: pilih paket ─────────────────────────────────────────────
    if (data.startsWith("po_pkg_")) {
      const pkgId = data.replace("po_pkg_", "");
      const packages = getPackagesWithMarkup("preorder");
      const pkg = packages.find((p) => p.id === pkgId);
      if (!pkg) {
        await bot.editMessageText("❌ Paket tidak ditemukan.", { chat_id: chatId, message_id: messageId });
        return;
      }
      setSession(userId, {
        step: "po_waiting_nomor" as any,
        packageId: pkg.id,
        selectedPackageName: pkg.name,
        selectedPackagePrice: pkg.price,
        preorderPackageSku: pkg.sku ?? pkg.id,
      });
      await bot.editMessageText(
        `⏳ <b>PRE ORDER</b>\n\n` +
        `Paket : <b>${pkg.name}</b>\n` +
        `Harga : <b>Rp ${pkg.price.toLocaleString("id-ID")}</b>\n\n` +
        `Masukkan <b>nomor tujuan</b> (contoh: <code>081234567890</code>):`,
        { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
      );
      return;
    }

    // ── PRE ORDER: bayar saldo ─────────────────────────────────────────────
    if (data === "po_paysaldo") {
      const session = getSession(userId);
      const nomor = (session as any).poNomor as string | undefined;
      const sku = (session as any).preorderPackageSku as string | undefined;
      const packageName = session.selectedPackageName ?? "";
      const price = session.selectedPackagePrice ?? 0;

      if (!nomor || !sku) {
        await bot.answerCallbackQuery(query.id, { text: "❌ Sesi habis, mulai ulang.", show_alert: true }).catch(() => {});
        return;
      }

      const from = query.from;
      const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);

      if (user.saldo < price) {
        await bot.editMessageText(
          `❌ <b>Saldo tidak cukup</b>\n\nSaldo Anda: <b>Rp ${user.saldo.toLocaleString("id-ID")}</b>\nDibutuhkan: <b>Rp ${price.toLocaleString("id-ID")}</b>\n\nTopup saldo terlebih dahulu.`,
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
        );
        clearSession(userId);
        return;
      }

      if (hasActivePendingPreOrder(nomor, sku)) {
        await bot.answerCallbackQuery(query.id, { text: "⚠️ Nomor ini sudah punya pre-order aktif untuk paket yang sama.", show_alert: true }).catch(() => {});
        return;
      }

      // Potong saldo
      const deduct = await withUserLock(userId, () =>
        deductSaldoAtomic(userId, price, { type: "pre_order", refId: nomor, note: `Pre-order ${sku}` })
      );
      if (!deduct.success) {
        await bot.editMessageText(
          `❌ Saldo tidak cukup.\nSaldo: <b>Rp ${(deduct.user?.saldo ?? 0).toLocaleString("id-ID")}</b>`,
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
        );
        clearSession(userId);
        return;
      }

      const po = createPreOrder({
        userId,
        userName: user.firstName + (user.lastName ? " " + user.lastName : ""),
        sku,
        packageName,
        nomorTujuan: nomor,
        price,
        paymentMethod: "saldo",
      });

      clearSession(userId);
      await bot.editMessageText(
        `✅ <b>PRE ORDER BERHASIL DIBUAT!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔖 ID : <code>${po.id}</code>\n` +
        `📦 Produk : <b>${packageName}</b>\n` +
        `📱 Nomor : <code>${nomor}</code>\n` +
        `💰 Dana : <b>Rp ${price.toLocaleString("id-ID")}</b>\n` +
        `📊 Status : <b>Menunggu stock</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `⏳ Pesanan akan diproses otomatis saat stok tersedia.\n` +
        `Hubungi @${SUPPORT_USERNAME} untuk pembatalan.`,
        { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
      );
      return;
    }

    if (data.startsWith("cat_")) {
      const category = data.replace("cat_", "") as Category;
      const packages = getPackagesWithMarkup(category);
      setSession(userId, { step: "select_package", category });
      const categoryLabels: Record<Category, string> = { akrab1: "AKRAB 1", akrab2: "AKRAB 2", circle: "CIRCLE", preorder: "PRE ORDER" };

      if (packages.length === 0) {
        await bot.editMessageText(
          `📦 <b>${categoryLabels[category]}</b>\n\n⚠️ Belum ada paket tersedia.\nHubungi admin: @${SUPPORT_USERNAME}`,
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: backToCategoryKeyboard() }
        );
        return;
      }
      await bot.editMessageText(
        `📦 <b>PAKET ${categoryLabels[category]}</b>\n\nPilih paket yang Anda inginkan:`,
        { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: packageInlineKeyboard(packages, 0, pkgKeyboardOpts(category, packages)) }
      );
      return;
    }

    if (data.startsWith("page_")) {
      const page = parseInt(data.replace("page_", ""), 10);
      const session = getSession(userId);
      const category = session.category as Category | undefined;
      if (!category) return;
      const packages = getPackagesWithMarkup(category);
      await bot.editMessageReplyMarkup(packageInlineKeyboard(packages, page, pkgKeyboardOpts(category, packages)), { chat_id: chatId, message_id: messageId });
      return;
    }

    if (data.startsWith("pkg_")) {
      const packageId = data.replace("pkg_", "");
      const session = getSession(userId);
      const category = session.category as Category | undefined;
      if (!category) return;
      const packages = getPackagesWithMarkup(category);
      const pkg = packages.find((p) => p.id === packageId);
      if (!pkg) { await bot.sendMessage(chatId, "❌ Paket tidak ditemukan."); return; }

      const currentPage = session.page ?? 0;
      const isDopu = pkg.source === "dopu";

      setSession(userId, {
        step: "confirm_order",
        packageId: pkg.id,
        selectedPackageName: pkg.name,
        selectedPackagePrice: pkg.price,
        selectedPackageBaseprice: pkg.baseprice ?? pkg.price,
        selectedPackageQuota: pkg.quota,
        selectedPackageValidity: pkg.validity,
        selectedCategory: category,
        selectedSku: pkg.sku,
        selectedSource: pkg.source,
        page: currentPage,
      });

      const detailLines: string[] = [];
      const showDescription = pkg.source !== "digiflaz";
      if (pkg.source === "api2" && pkg.sku) {
        detailLines.push(`Produk: <b>${pkg.name}</b>`);
        const slot = pkg.stock ?? 0;
        const stokStatus = slot > 0 ? `✅ Tersedia (${slot} slot)` : "❌ Kosong";
        detailLines.push(`Stok: <b>${stokStatus}</b>`);
        detailLines.push(`Harga: <b>Rp ${pkg.price.toLocaleString("id-ID")}</b>`);
      } else if (pkg.source === "digiflaz") {
        detailLines.push(`Nama: <b>${pkg.name}</b>`);
        detailLines.push(`Masa Aktif: <b>${pkg.validity}</b>`);
        detailLines.push(`Harga: <b>Rp ${pkg.price.toLocaleString("id-ID")}</b>`);
      } else if (isDopu && pkg.sku) {
        detailLines.push(`Produk: <b>${pkg.name}</b>`);
        detailLines.push(`Masa Aktif: <b>${pkg.validity}</b>`);
        detailLines.push(`Harga: <b>Rp ${pkg.price.toLocaleString("id-ID")}</b>`);
      } else {
        detailLines.push(`Nama: <b>${pkg.name}</b>`);
        detailLines.push(`Kuota: <b>${pkg.quota}</b>`);
        detailLines.push(`Masa Aktif: <b>${pkg.validity}</b>`);
        detailLines.push(`Harga: <b>Rp ${pkg.price.toLocaleString("id-ID")}</b>`);
      }

      await bot.editMessageText(
        `📦 <b>DETAIL PAKET</b>\n\n` +
        detailLines.join("\n") + "\n\n" +
        (showDescription && pkg.description ? `${pkg.description}\n\n` : "") +
        `Konfirmasi order paket ini?`,
        { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: confirmOrderKeyboard(pkg.id, false, true) }
      );
      return;
    }

    if (data === "back_to_list") {
      const session = getSession(userId);
      const category = session.category as Category | undefined;
      if (!category) return;
      const packages = getPackagesWithMarkup(category);
      const page = session.page ?? 0;
      const categoryLabels: Record<Category, string> = { akrab1: "AKRAB 1", akrab2: "AKRAB 2", circle: "CIRCLE", preorder: "PRE ORDER" };
      await bot.editMessageText(
        `📦 <b>PAKET ${categoryLabels[category]}</b>\n\nPilih paket yang Anda inginkan:`,
        { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: packageInlineKeyboard(packages, page, pkgKeyboardOpts(category, packages)) }
      );
      return;
    }

    if (data.startsWith("confirm_")) {
      const session = getSession(userId);

      // Cek stok real-time untuk paket KHFY (akrab2 / source "api2")
      if (session.selectedCategory === "akrab2" && session.packageId) {
        const packages = getPackagesWithMarkup("akrab2");
        const pkg = packages.find((p) => p.id === session.packageId);
        if (pkg && pkg.stock !== undefined && pkg.stock <= 0) {
          await bot.answerCallbackQuery(query.id, {
            text: "❌ Stok paket ini sedang kosong!",
            show_alert: true,
          }).catch(() => {});
          await bot.editMessageText(
            `📦 <b>DETAIL PAKET</b>\n\n` +
            `Produk: <b>${pkg.name}</b>\n` +
            `Stok: <b>❌ Kosong</b>\n` +
            `Harga: <b>Rp ${pkg.price.toLocaleString("id-ID")}</b>\n\n` +
            `⚠️ <b>Maaf, stok paket ini sedang habis.</b>\n` +
            `Silakan pilih paket lain atau hubungi admin @${SUPPORT_USERNAME}.`,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: "HTML",
              reply_markup: backToCategoryKeyboard(),
            }
          );
          return;
        }
      }

      setSession(userId, { step: "waiting_nomor_tujuan" });

      await bot.editMessageText(
        `📱 <b>MASUKKAN NOMOR TUJUAN</b>\n\n` +
        `Paket: <b>${session.selectedPackageName ?? "-"}</b>\n` +
        `Harga: <b>Rp ${(session.selectedPackagePrice ?? 0).toLocaleString("id-ID")}</b>\n\n` +
        `Silahkan masukan nomor tujuan:\n<i>(contoh: 081234567890)</i>`,
        { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
      );
      return;
    }

    if (data === "paysaldo") {
      const from = query.from;
      const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);
      const session = getSession(userId);

      // === FIX 1: Double-tap guard ===
      // If the order is already being processed for this user, silently ignore duplicate callback
      if ((session.step as string) === "processing_order") {
        await bot.answerCallbackQuery(query.id, {
          text: "⏳ Order sedang diproses, harap tunggu...",
          show_alert: false,
        }).catch(() => {});
        return;
      }

      const price = session.selectedPackagePrice ?? 0;
      const nomor = session.selectedNomorTujuan ?? "";
      const sku = session.selectedSku ?? "";
      const sessionSource = session.selectedSource ?? "";
      const isManualSource = sessionSource === "manual" || (!sku && !sessionSource);

      if (!nomor || (!sku && !isManualSource)) {
        await bot.sendMessage(chatId, "❌ Sesi tidak valid. Silakan order ulang.", { parse_mode: "HTML" });
        clearSession(userId);
        return;
      }

      if (price <= 0) {
        await bot.editMessageText(
          `❌ <b>Harga belum diset</b>\n\n` +
          `Paket <b>${session.selectedPackageName ?? sku}</b> belum memiliki harga.\n\n` +
          `Silakan hubungi @${SUPPORT_USERNAME} untuk info harga.`,
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
        );
        clearSession(userId);
        return;
      }

      // Mark session as processing BEFORE lock — subsequent callbacks will be blocked
      setSession(userId, { step: "processing_order" as any });

      // Atomic check + deduct — safe under concurrent requests for the same user
      const deductResult = await withUserLock(userId, () =>
        deductSaldoAtomic(userId, price, {
          type: "order_deduct",
          refId: session.packageId ?? sku,
          note: `Order ${session.selectedPackageName ?? sku} ke ${nomor}`,
        })
      );

      if (!deductResult.success) {
        // Deduction failed — reset session so user can retry
        setSession(userId, { step: "waiting_nomor_tujuan" });
        const currentSaldo = deductResult.user?.saldo ?? user.saldo;
        await bot.editMessageText(
          `❌ <b>Saldo tidak cukup</b>\n\n` +
          `Saldo Anda: <b>Rp ${currentSaldo.toLocaleString("id-ID")}</b>\n` +
          `Dibutuhkan: <b>Rp ${price.toLocaleString("id-ID")}</b>\n\n` +
          `Silakan topup saldo terlebih dahulu melalui menu 💰 TOPUP.`,
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
        );
        return;
      }

      const selectedCat = session.selectedCategory ?? "akrab2";
      const selectedSource = session.selectedSource ?? "";
      const useManual = isManualSource;
      const useDigiflaz = !useManual && selectedSource === "digiflaz";
      const useDopu = !useManual && !useDigiflaz && (selectedSource === "dopu" || selectedCat === "akrab1" || selectedCat === "circle");

      // Pre-generate reffId for DOPU/Digiflaz so it can be stored before the API call
      const preReffId = randomUUID().replace(/-/g, "").slice(0, 20);

      // === FIX 4/5: Create order record BEFORE calling API ===
      // This ensures the transaction is always recorded even if the bot crashes mid-order.
      // Status "processing" means: saldo deducted, API call in-flight.
      const pendingOrder = createOrder({
        userId,
        userName: user.firstName + (user.lastName ? " " + user.lastName : ""),
        userUsername: user.username ?? undefined,
        category: selectedCat,
        packageId: session.packageId ?? "",
        packageName: session.selectedPackageName ?? sku,
        price,
        baseprice: session.selectedPackageBaseprice ?? price,
        quota: session.selectedPackageQuota ?? "",
        validity: session.selectedPackageValidity ?? "",
        nomorTujuan: nomor,
        reffId: preReffId,
        paymentMethod: "saldo",
        provider: useDigiflaz ? "digiflaz" : useDopu ? "dopu" : "khfy",
      });
      // Override default "pending" → "processing" immediately
      updateOrderStatus(pendingOrder.id, "processing");

      await bot.editMessageText(
        `⏳ <b>Memproses order...</b>\n\nSaldo dikurangi sementara. Mohon tunggu...`,
        { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
      );

      const result = useManual
        ? { success: true as const, sn: undefined, pending: false, message: "manual" }
        : useDigiflaz
          ? await placeDigiflazOrder({ sku, tujuan: nomor, refId: preReffId })
          : useDopu
            ? await placeDopuOrder({ sku, tujuan: nomor, reffId: preReffId })
            : await placeKhfyOrder({ sku, tujuan: nomor, reffId: preReffId });
      const updatedUser = getUser(userId);

      // Extract provider-specific fields safely
      const dopuResult = useDopu ? (result as DopuOrderResult) : null;
      const digiflazResult = useDigiflaz ? (result as DigiflazOrderResult) : null;
      const dopuRef = dopuResult?.reffId ?? (digiflazResult ? (result as DigiflazOrderResult).refId : "") ?? preReffId;
      const dopuPending = (dopuResult && result.success ? (result as any).pending === true : false)
        || (digiflazResult && result.success ? (result as any).pending === true : false);

      if (result.success) {
        const sn = result.sn;
        // Update the pre-created order with SN and final status
        updateOrderStatus(pendingOrder.id, dopuPending ? "processing" : "done", sn || undefined);

        if (dopuPending) {
          // DOPU/Digiflaz async — order accepted but not yet confirmed
          const circleNote = selectedCat === "circle" && !useDigiflaz
            ? `\n\n📱 Buka aplikasi MyXL → konfirmasi undangan Circle yang masuk ke nomor tujuan.`
            : "";
          await bot.editMessageText(
            `⚙️ <b>ORDER SEDANG DIPROSES</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🔖 Order ID  : <code>${pendingOrder.id}</code>\n` +
            `📦 Produk: <b>${session.selectedPackageName ?? sku}</b>\n` +
            `📱 Nomor: <code>${nomor}</code>\n` +
            `💰 Harga: <b>Rp ${price.toLocaleString("id-ID")}</b>\n` +
            (sn ? `🔑 No. Trx: <code>${sn}</code>\n` : "") +
            `\n• Saldo tersisa: <b>Rp ${(updatedUser?.saldo ?? 0).toLocaleString("id-ID")}</b>\n\n` +
            `⏳ <i>Paket sedang diproses. Jika dalam 30 menit tidak masuk, hubungi admin.</i>` +
            circleNote,
            { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
          );

          // Auto-poll status via orderPoller (shared with resume-on-restart logic)
          if (dopuRef) {
            const dopuTrxId = sn || undefined;
            startOrderPolling(bot, pendingOrder, {
              provider: useDigiflaz ? "digiflaz" : "dopu",
              dopuTrxId,
              delayMs: 60 * 1000,
            });
          }
                } else {
            // KHFY — handle result langsung
            const khfyTrxId = (result as any).trxid || result.sn || undefined;
            if (!khfyTrxId && result.sn) {
              // Langsung sukses
              updateOrderStatus(pendingOrder.id, "done", result.sn);
              const _n = new Date();
              const _tgl = _n.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
              const _jam = _n.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
              await bot.editMessageText(
                `✅ <b>ORDER BERHASIL !</b>\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `🔖 Order ID : <code>${pendingOrder.id}</code>\n` +
                `📦 Produk : <b>${session.selectedPackageName ?? sku}</b>\n` +
                `📱 Target : <code>${nomor}</code>\n` +
                `💰 Harga : <b>Rp ${price.toLocaleString("id-ID")}</b>\n` +
                `• Saldo tersisa: <b>Rp ${(updatedUser?.saldo ?? 0).toLocaleString("id-ID")}</b>\n` +
                `📅 Date  : ${_tgl}\n\nJam Sukses : ${_jam} WIB\n\nTerimakasih sudah berbelanja ☺️☺️`,
                { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
              ).catch(() => {});
            } else {
              // Pending — mulai polling
              updateOrderStatus(pendingOrder.id, "processing", khfyTrxId);
              await bot.editMessageText(
                `⚙️ <b>ORDER SEDANG DIPROSES</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `🔖 Order ID  : <code>${pendingOrder.id}</code>\n` +
                `📦 Produk: <b>${session.selectedPackageName ?? sku}</b>\n` +
                `📱 Nomor: <code>${nomor}</code>\n` +
                `💰 Harga: <b>Rp ${price.toLocaleString("id-ID")}</b>\n` +
                `\n• Saldo tersisa: <b>Rp ${(updatedUser?.saldo ?? 0).toLocaleString("id-ID")}</b>\n\n` +
                `⏳ <i>Paket sedang diproses. Notifikasi otomatis akan dikirim.</i>`,
                { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
              ).catch(() => {});
              startOrderPolling(bot, pendingOrder, { provider: "khfy", khfyTrxId, delayMs: 5000 });
            }
          }
      } else {
        // API call failed — mark order cancelled, then refund saldo
        updateOrderStatus(pendingOrder.id, "cancelled");
        await creditSaldoAtomic(userId, price, {
          type: "order_refund",
          refId: pendingOrder.id,
          note: `Refund order gagal: ${result.error ?? ""}`,
        });
        const refundedUser = getUser(userId);
        await bot.editMessageText(
          `❌ <b>ORDER GAGAL</b>\n\n` +
          `⚠️ ${(/kosong|stok|habis/i.test(String(result.error ?? "")) ? "Stok sedang kosong. Coba produk lain." : /nomor|tujuan|invalid|dest/i.test(String(result.error ?? "")) ? "Nomor tujuan tidak valid." : "Transaksi gagal. Hubungi admin.")}` +
          (dopuRef ? `\n🔖 Ref: <code>${dopuRef}</code>` : "") +
          `\n\n💰 Saldo <b>Rp ${price.toLocaleString("id-ID")}</b> telah dikembalikan.\n` +
          `Saldo sekarang: <b>Rp ${(refundedUser?.saldo ?? 0).toLocaleString("id-ID")}</b>`,
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
        );
      }

      clearSession(userId);
      return;
    }

    if (data === "payqris") {
      const from = query.from;
      const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);
      const session = getSession(userId);
      const price = session.selectedPackagePrice ?? 0;
      const nomor = session.selectedNomorTujuan ?? "";
      const sku = session.selectedSku ?? "";
      const qrisSource = session.selectedSource ?? "";
      const isQrisManual = qrisSource === "manual" || (!sku && !qrisSource);

      if (!nomor || (!sku && !isQrisManual)) {
        await bot.sendMessage(chatId, "❌ Sesi tidak valid. Silakan order ulang.", { parse_mode: "HTML" });
        clearSession(userId);
        return;
      }

      if (price <= 0) {
        await bot.editMessageText(
          `❌ <b>Harga belum diset</b>\n\n` +
          `Paket <b>${session.selectedPackageName ?? sku}</b> belum memiliki harga.\n\n` +
          `Silakan hubungi @${SUPPORT_USERNAME} untuk info harga.`,
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
        );
        clearSession(userId);
        return;
      }

      await bot.editMessageText(
        `⏳ <b>Membuat QRIS...</b>\n\nMohon tunggu sebentar.`,
        { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
      );

      const result = await createPakasirTopup({
        userId,
        chatId,
        userName: user.firstName + (user.lastName ? " " + user.lastName : ""),
        nominal: price,
        orderPayload: {
          sku,
          nomorTujuan: nomor,
          packageName: session.selectedPackageName ?? sku,
          category: session.selectedCategory ?? "akrab2",
          packageId: session.packageId ?? "",
          quota: session.selectedPackageQuota ?? "",
          validity: session.selectedPackageValidity ?? "",
          source: session.selectedSource,
          baseprice: session.selectedPackageBaseprice,
        },
      });

      clearSession(userId);

      if ("error" in result) {
        await bot.editMessageText(
          `❌ ${result.error}`,
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
        );
        return;
      }

      const { order, qrisString } = result;
      const expiryMinutes = 3;

      let qrBuffer: Buffer;
      try {
        qrBuffer = await QRCode.toBuffer(qrisString, { errorCorrectionLevel: "M", width: 512, margin: 2 });
      } catch (err) {
        logger.error({ err }, "QR gen failed for order payment");
        await bot.editMessageText("❌ Gagal membuat gambar QR. Coba lagi.", { chat_id: chatId, message_id: messageId, parse_mode: "HTML" });
        return;
      }

      const caption =
        `📱 <b>BAYAR LANGSUNG (QRIS)</b>\n\n` +
        `• Produk: <b>${session.selectedPackageName ?? sku}</b>\n` +
        `• Nomor: <code>${nomor}</code>\n` +
        `• Total: <b>Rp ${order.total.toLocaleString("id-ID")}</b>\n` +
        `• Order ID: <code>${order.id}</code>\n` +
        `• Exp: <b>${expiryMinutes} Menit</b>\n\n` +
        `📌 <i>Fee: 0.7% + Rp 310. Di atas Rp 105.000: 1% + Rp 0.</i>\n\n` +
        `<i>Scan QR menggunakan GoPay, OVO, Dana, dll.</i>\n\n` +
        `✅ <i>Setelah transfer, order akan diproses <b>otomatis</b>. Tidak perlu konfirmasi.</i>`;

      try {
        await bot.deleteMessage(chatId, messageId);
      } catch { }

      await bot.sendPhoto(chatId, qrBuffer, { caption, parse_mode: "HTML" });

      setTimeout(async () => {
        const t = getTopupById(order.id);
        if (t && t.status === "pending") {
          updateTopupStatus(order.id, "expired");
          try {
            await bot.sendMessage(chatId, `⏰ QRIS order <code>${order.id}</code> kadaluarsa.`, { parse_mode: "HTML" });
          } catch { }
        }
      }, expiryMinutes * 60 * 1000);

      return;
    }
  });

  bot.on("polling_error", (err) => {
    logger.error({ err }, "Telegram polling error");
  });
}

function handleOrder(bot: TelegramBot) {
  return async (msg: TelegramBot.Message) => {
    const userId = msg.from?.id ?? msg.chat.id;
    if (isBlocked(userId)) return;
    if (getSession(userId).step === "waiting_whatsapp") {
      await bot.sendMessage(msg.chat.id, `📱 <b>Daftarkan Nomor WhatsApp Anda</b>\n\nMasukkan nomor WhatsApp untuk melanjutkan.\n\nContoh: <code>081234567890</code>`, { parse_mode: 'HTML' });
      return;
    }
    setSession(userId, { step: "select_category" });
    await bot.sendMessage(msg.chat.id, "📦 <b>PILIH KATEGORI</b>\n\nSilakan pilih kategori paket yang tersedia:", {
      parse_mode: "HTML",
      reply_markup: categoryInlineKeyboard(),
    });
  };
}
