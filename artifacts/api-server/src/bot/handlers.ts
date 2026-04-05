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
      `Selamat datang di *Ags Store | Paket Akrab* 👋\n\nHalo *${name}*!\n\nSilakan pilih menu di bawah:`,
      {
        parse_mode: "Markdown",
        reply_markup: mainMenuKeyboard(),
      }
    );
  });

  bot.onText(/\/order/, handleOrder(bot));
  bot.onText(/📦 ORDER/, handleOrder(bot));

  bot.onText(/💰 TOPUP/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "💰 *TOPUP SALDO*\n\nUntuk topup saldo, silakan hubungi admin:\n@Agsstore_29",
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/📋 RIWAYAT TRANSAKSI/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "📋 *RIWAYAT TRANSAKSI*\n\nFitur ini akan segera tersedia.",
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/📊 CEK STOK/, async (msg) => {
    const akrab1 = getPackages("akrab1");
    const akrab2 = getPackages("akrab2");
    const circle = getPackages("circle");

    const text =
      `📊 *CEK STOK PAKET*\n\n` +
      `🟢 AKRAB 1: ${akrab1.length} paket tersedia\n` +
      `🟡 AKRAB 2: ${akrab2.length} paket tersedia\n` +
      `🔵 CIRCLE: ${circle.length} paket tersedia`;

    await bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
  });

  bot.onText(/📱 CEK PAKET/, handleOrder(bot));

  bot.onText(/📍 CEK LOKASI/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "📍 *CEK LOKASI*\n\nFitur cek lokasi akan segera tersedia.",
      { parse_mode: "Markdown" }
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
      await bot.editMessageText("📦 *PILIH KATEGORI*\n\nSilakan pilih kategori paket yang tersedia:", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
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
          `📦 *${categoryLabels[category]}*\n\n⚠️ Belum ada paket tersedia di kategori ini.\nHubungi admin: @Agsstore_29`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: backToCategoryKeyboard(),
          }
        );
        return;
      }

      await bot.editMessageText(
        `📦 *PAKET ${categoryLabels[category]}*\n\nPilih paket yang Anda inginkan:`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
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

      const categoryLabels: Record<Category, string> = {
        akrab1: "AKRAB 1",
        akrab2: "AKRAB 2",
        circle: "CIRCLE",
      };

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
        `📦 *DETAIL PAKET*\n\n` +
        `Nama: *${pkg.name}*\n` +
        `Kuota: *${pkg.quota}*\n` +
        `Masa Aktif: *${pkg.validity}*\n` +
        `Harga: *Rp ${pkg.price.toLocaleString("id-ID")}*\n\n` +
        (pkg.description ? `${pkg.description}\n\n` : "") +
        `Konfirmasi order paket ini?`;

      await bot.editMessageText(detail, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: confirmOrderKeyboard(pkg.id),
      });
      return;
    }

    if (data.startsWith("confirm_")) {
      const session = getSession(userId);
      const name = query.from.first_name ?? "Pelanggan";

      await bot.editMessageText(
        `✅ *ORDER DITERIMA*\n\n` +
          `Halo *${name}*, order Anda telah diterima!\n\n` +
          `Paket: *${session.selectedPackageName}*\n` +
          `Harga: *Rp ${session.selectedPackagePrice?.toLocaleString("id-ID")}*\n\n` +
          `Silakan lakukan pembayaran dan kirim bukti ke admin:\n@Agsstore_29`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
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

    await bot.sendMessage(chatId, "📦 *PILIH KATEGORI*\n\nSilakan pilih kategori paket yang tersedia:", {
      parse_mode: "Markdown",
      reply_markup: categoryInlineKeyboard(),
    });
  };
}
