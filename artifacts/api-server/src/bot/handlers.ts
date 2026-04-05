import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { getPackages, type Category } from "./store";
import { getSession, setSession, clearSession } from "./sessions";
import {
  mainMenuKeyboard,
  categoryInlineKeyboard,
  packageInlineKeyboard,
  confirmOrderKeyboard,
  backToCategoryKeyboard,
} from "./keyboards";

export function setupHandlers(bot: TelegramBot) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id ?? chatId;
    const name = msg.from?.first_name ?? "Pelanggan";
    clearSession(userId);

    await bot.sendMessage(
      chatId,
      `Selamat datang di <b>Ags Store | Paket Akrab</b> 👋\n\nHalo <b>${name}</b>!\n\nSilakan pilih menu di bawah:`,
      {
        parse_mode: "HTML",
        reply_markup: mainMenuKeyboard(),
      }
    );
  });

  bot.onText(/\/order/, handleOrder(bot));
  bot.onText(/📦 ORDER/, handleOrder(bot));

  bot.onText(/💰 TOPUP/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "💰 <b>TOPUP SALDO</b>\n\nUntuk topup saldo, silakan hubungi admin:\n@Agsstore_29",
      { parse_mode: "HTML" }
    );
  });

  bot.onText(/📋 RIWAYAT TRANSAKSI/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "📋 <b>RIWAYAT TRANSAKSI</b>\n\nFitur ini akan segera tersedia.",
      { parse_mode: "HTML" }
    );
  });

  bot.onText(/📊 CEK STOK/, async (msg) => {
    const akrab1 = getPackages("akrab1");
    const akrab2 = getPackages("akrab2");
    const circle = getPackages("circle");

    const text =
      `📊 <b>CEK STOK PAKET</b>\n\n` +
      `🟢 AKRAB 1: <b>${akrab1.length}</b> paket tersedia\n` +
      `🟡 AKRAB 2: <b>${akrab2.length}</b> paket tersedia\n` +
      `🔵 CIRCLE: <b>${circle.length}</b> paket tersedia`;

    await bot.sendMessage(msg.chat.id, text, { parse_mode: "HTML" });
  });

  bot.onText(/📱 CEK PAKET/, handleOrder(bot));

  bot.onText(/📍 CEK LOKASI/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "📍 <b>CEK LOKASI</b>\n\nFitur cek lokasi akan segera tersedia.",
      { parse_mode: "HTML" }
    );
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
          `📦 <b>${categoryLabels[category]}</b>\n\n⚠️ Belum ada paket tersedia di kategori ini.\nHubungi admin: @Agsstore_29`,
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
      const name = query.from.first_name ?? "Pelanggan";

      await bot.editMessageText(
        `✅ <b>ORDER DITERIMA</b>\n\n` +
          `Halo <b>${name}</b>, order Anda telah diterima!\n\n` +
          `Paket: <b>${session.selectedPackageName}</b>\n` +
          `Harga: <b>Rp ${session.selectedPackagePrice?.toLocaleString("id-ID")}</b>\n\n` +
          `Silakan lakukan pembayaran dan kirim bukti ke admin:\n@Agsstore_29`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
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
