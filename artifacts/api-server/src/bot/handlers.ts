import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { getPackages, type Category } from "./store";
import { getSession, setSession, clearSession } from "./sessions";
import { getOrRegisterUser, getUser, formatRegDate } from "./users";
import {
  createOrder,
  getOrdersByUser,
  formatOrderDate,
  statusLabel,
} from "./orders";
import {
  mainMenuKeyboard,
  categoryInlineKeyboard,
  packageInlineKeyboard,
  confirmOrderKeyboard,
  backToCategoryKeyboard,
} from "./keyboards";

const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME ?? "Agsstore_29";
const PAKASIR_URL = process.env.PAKASIR_PAYMENT_URL ?? "";
const CEK_STOK_URL = process.env.CEK_STOK_URL ?? "";
const CEK_PAKET_URL = process.env.CEK_PAKET_URL ?? "";
const CEK_LOKASI_URL = process.env.CEK_LOKASI_URL ?? "";

function buildProfileText(user: ReturnType<typeof getUser>): string {
  if (!user) return "Profil tidak ditemukan.";
  return (
    `👤 <b>PROFIL ANDA</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `• Nama: <b>${user.firstName}${user.lastName ? " " + user.lastName : ""}</b>\n` +
    `• ID: <code>${user.telegramId}</code>\n` +
    (user.username ? `• User: @${user.username}\n` : "") +
    `• UID: <b>${user.uid}</b>\n` +
    `• Reg: <b>${formatRegDate(user.regDate)}</b>\n\n` +
    `<b>Saldo: Rp ${user.saldo.toLocaleString("id-ID")}</b>\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Ada kendala? Hubungi @${SUPPORT_USERNAME}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📦 Sila Pilih Menu di bawah:`
  );
}

export function setupHandlers(bot: TelegramBot) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from!;
    const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);
    clearSession(from.id);
    await bot.sendMessage(chatId, buildProfileText(user), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.onText(/🏠 Menu/, async (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from!;
    const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);
    clearSession(from.id);
    await bot.sendMessage(chatId, buildProfileText(user), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.onText(/\/order/, handleOrder(bot));
  bot.onText(/📦 ORDER/, handleOrder(bot));

  bot.onText(/💰 TOPUP/, async (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from!;
    const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);

    const topupText =
      `💰 <b>TOPUP SALDO</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Saldo Anda saat ini: <b>Rp ${user.saldo.toLocaleString("id-ID")}</b>\n\n` +
      `Silakan lakukan pembayaran melalui QRIS di bawah ini:`;

    const keyboard: TelegramBot.InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: "💳 Bayar via QRIS (Pakasir)", url: PAKASIR_URL || `https://t.me/${SUPPORT_USERNAME}` }],
        [{ text: "📩 Konfirmasi ke Admin", url: `https://t.me/${SUPPORT_USERNAME}` }],
      ],
    };

    await bot.sendMessage(chatId, topupText, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  bot.onText(/📋 RIWAYAT TRANSAKSI/, async (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from!;
    const userOrders = getOrdersByUser(from.id);

    if (userOrders.length === 0) {
      await bot.sendMessage(
        chatId,
        "📋 <b>RIWAYAT TRANSAKSI</b>\n\n━━━━━━━━━━━━━━━━━━━━\n\nAnda belum memiliki riwayat order.",
        { parse_mode: "HTML" }
      );
      return;
    }

    const maxShow = 5;
    const shown = userOrders.slice(0, maxShow);

    let text = `📋 <b>RIWAYAT TRANSAKSI</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    shown.forEach((order, idx) => {
      text +=
        `<b>${idx + 1}. ${order.packageName}</b>\n` +
        `   🗂 ID: <code>${order.id}</code>\n` +
        `   📦 ${order.quota} | ${order.validity}\n` +
        `   💰 Rp ${order.price.toLocaleString("id-ID")}\n` +
        `   ${statusLabel[order.status]}\n` +
        `   🕐 ${formatOrderDate(order.createdAt)}\n\n`;
    });

    if (userOrders.length > maxShow) {
      text += `<i>... dan ${userOrders.length - maxShow} transaksi lainnya</i>`;
    }

    await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
  });

  bot.onText(/📊 CEK STOK/, async (msg) => {
    const chatId = msg.chat.id;

    if (CEK_STOK_URL) {
      const keyboard: TelegramBot.InlineKeyboardMarkup = {
        inline_keyboard: [[{ text: "📊 Buka Cek Stok", web_app: { url: CEK_STOK_URL } }]],
      };
      await bot.sendMessage(chatId, "📊 <b>CEK STOK</b>\n\nKlik tombol di bawah untuk melihat stok:", {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } else {
      const akrab1 = getPackages("akrab1");
      const akrab2 = getPackages("akrab2");
      const circle = getPackages("circle");
      const text =
        `📊 <b>CEK STOK PAKET</b>\n\n` +
        `🟢 AKRAB 1: <b>${akrab1.length}</b> paket tersedia\n` +
        `🟡 AKRAB 2: <b>${akrab2.length}</b> paket tersedia\n` +
        `🔵 CIRCLE: <b>${circle.length}</b> paket tersedia`;
      await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    }
  });

  bot.onText(/📱 CEK PAKET/, async (msg) => {
    const chatId = msg.chat.id;

    if (CEK_PAKET_URL) {
      const keyboard: TelegramBot.InlineKeyboardMarkup = {
        inline_keyboard: [[{ text: "📱 Buka Cek Paket", web_app: { url: CEK_PAKET_URL } }]],
      };
      await bot.sendMessage(chatId, "📱 <b>CEK PAKET</b>\n\nKlik tombol di bawah untuk melihat paket:", {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } else {
      handleOrder(bot)(msg);
    }
  });

  bot.onText(/📍 CEK LOKASI/, async (msg) => {
    const chatId = msg.chat.id;

    if (CEK_LOKASI_URL) {
      const keyboard: TelegramBot.InlineKeyboardMarkup = {
        inline_keyboard: [[{ text: "📍 Buka Cek Lokasi", web_app: { url: CEK_LOKASI_URL } }]],
      };
      await bot.sendMessage(chatId, "📍 <b>CEK LOKASI</b>\n\nKlik tombol di bawah untuk melihat lokasi:", {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } else {
      await bot.sendMessage(
        chatId,
        "📍 <b>CEK LOKASI</b>\n\nMiniapp lokasi belum tersedia. Hubungi @" + SUPPORT_USERNAME,
        { parse_mode: "HTML" }
      );
    }
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id;
    const messageId = query.message?.message_id;
    const userId = query.from.id;
    const data = query.data ?? "";

    if (!chatId || !messageId) return;

    try {
      await bot.answerCallbackQuery(query.id);
    } catch {
      // ignore
    }

    if (data === "back_category") {
      setSession(userId, { step: "select_category", category: undefined, packageId: undefined });
      await bot.editMessageText("📦 <b>PILIH KATEGORI</b>\n\nSilakan pilih kategori paket yang tersedia:", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: categoryInlineKeyboard(),
      });
      return;
    }

    if (data === "cancel_order") {
      clearSession(userId);
      await bot.editMessageText(
        "❌ Order dibatalkan.\n\nKetik /order untuk memulai order baru.",
        { chat_id: chatId, message_id: messageId }
      );
      return;
    }

    if (data.startsWith("cat_")) {
      const category = data.replace("cat_", "") as Category;
      const packages = getPackages(category);
      setSession(userId, { step: "select_package", category });

      const categoryLabels: Record<Category, string> = {
        akrab1: "AKRAB 1",
        akrab2: "AKRAB 2",
        circle: "CIRCLE",
      };

      if (packages.length === 0) {
        await bot.editMessageText(
          `📦 <b>${categoryLabels[category]}</b>\n\n⚠️ Belum ada paket tersedia di kategori ini.\nHubungi admin: @${SUPPORT_USERNAME}`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: backToCategoryKeyboard(),
          }
        );
        return;
      }

      await bot.editMessageText(
        `📦 <b>PAKET ${categoryLabels[category]}</b>\n\nPilih paket yang Anda inginkan:`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: packageInlineKeyboard(packages, 0),
        }
      );
      return;
    }

    if (data.startsWith("page_")) {
      const page = parseInt(data.replace("page_", ""), 10);
      const session = getSession(userId);
      const category = session.category as Category | undefined;
      if (!category) return;
      const packages = getPackages(category);

      await bot.editMessageReplyMarkup(packageInlineKeyboard(packages, page), {
        chat_id: chatId,
        message_id: messageId,
      });
      return;
    }

    if (data.startsWith("pkg_")) {
      const packageId = data.replace("pkg_", "");
      const session = getSession(userId);
      const category = session.category as Category | undefined;
      if (!category) return;

      const packages = getPackages(category);
      const pkg = packages.find((p) => p.id === packageId);
      if (!pkg) {
        await bot.sendMessage(chatId, "❌ Paket tidak ditemukan. Silakan pilih ulang.");
        return;
      }

      setSession(userId, {
        step: "confirm_order",
        packageId: pkg.id,
        selectedPackageName: pkg.name,
        selectedPackagePrice: pkg.price,
        selectedPackageQuota: pkg.quota,
        selectedPackageValidity: pkg.validity,
        selectedCategory: category,
      });

      const detail =
        `📦 <b>DETAIL PAKET</b>\n\n` +
        `Nama: <b>${pkg.name}</b>\n` +
        `Kuota: <b>${pkg.quota}</b>\n` +
        `Masa Aktif: <b>${pkg.validity}</b>\n` +
        `Harga: <b>Rp ${pkg.price.toLocaleString("id-ID")}</b>\n\n` +
        (pkg.description ? `${pkg.description}\n\n` : "") +
        `Konfirmasi order paket ini?`;

      await bot.editMessageText(detail, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: confirmOrderKeyboard(pkg.id),
      });
      return;
    }

    if (data.startsWith("confirm_")) {
      const session = getSession(userId);
      const from = query.from;
      const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);

      const order = createOrder({
        userId: from.id,
        userName: user.firstName + (user.lastName ? " " + user.lastName : ""),
        category: session.selectedCategory ?? "",
        packageId: session.packageId ?? "",
        packageName: session.selectedPackageName ?? "",
        price: session.selectedPackagePrice ?? 0,
        quota: session.selectedPackageQuota ?? "",
        validity: session.selectedPackageValidity ?? "",
      });

      await bot.editMessageText(
        `✅ <b>ORDER DITERIMA</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Halo <b>${user.firstName}</b>, order Anda telah diterima!\n\n` +
          `🗂 ID Order: <code>${order.id}</code>\n` +
          `📦 Paket: <b>${order.packageName}</b>\n` +
          `📊 Kuota: <b>${order.quota}</b>\n` +
          `⏱ Masa Aktif: <b>${order.validity}</b>\n` +
          `💰 Harga: <b>Rp ${order.price.toLocaleString("id-ID")}</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Silakan lakukan pembayaran dan kirim bukti ke admin:\n@${SUPPORT_USERNAME}`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "💳 Bayar via QRIS (Pakasir)", url: PAKASIR_URL || `https://t.me/${SUPPORT_USERNAME}` }],
              [{ text: "📩 Konfirmasi ke Admin", url: `https://t.me/${SUPPORT_USERNAME}` }],
            ],
          },
        }
      );

      clearSession(userId);
      return;
    }
  });

  bot.on("polling_error", (err) => {
    logger.error({ err }, "Telegram polling error");
  });
}

function handleOrder(bot: TelegramBot) {
  return async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id ?? chatId;
    setSession(userId, { step: "select_category" });

    await bot.sendMessage(chatId, "📦 <b>PILIH KATEGORI</b>\n\nSilakan pilih kategori paket yang tersedia:", {
      parse_mode: "HTML",
      reply_markup: categoryInlineKeyboard(),
    });
  };
}
