import TelegramBot from "node-telegram-bot-api";
import { type PackageItem } from "./store";

export function mainMenuKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "📦 ORDER" }],
      [{ text: "💰 TOPUP" }, { text: "📋 RIWAYAT TRANSAKSI" }],
      [{ text: "📊 CEK STOK" }, { text: "📱 CEK PAKET" }],
      [{ text: "📍 CEK LOKASI" }],
      [{ text: "🏠 Menu" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

export function categoryInlineKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "AKRAB 1", callback_data: "cat_akrab1" },
        { text: "AKRAB 2", callback_data: "cat_akrab2" },
      ],
      [
        { text: "CIRCLE", callback_data: "cat_circle" },
      ],
    ],
  };
}

export function packageInlineKeyboard(
  packages: PackageItem[],
  page = 0,
  pageSize = 6,
): TelegramBot.InlineKeyboardMarkup {
  const start = page * pageSize;
  const end = start + pageSize;
  const pageItems = packages.slice(start, end);
  const totalPages = Math.ceil(packages.length / pageSize);

  const buttons: TelegramBot.InlineKeyboardButton[] = pageItems.map((pkg) => {
    let label: string;
    if (pkg.source === "api2" && pkg.sku) {
      const stockText = pkg.stock && pkg.stock > 0 ? `✅ ${pkg.stock}` : "❌";
      label = `${pkg.name} ${stockText} — Rp ${pkg.price.toLocaleString("id-ID")}`;
    } else {
      label = `${pkg.name} — Rp ${pkg.price.toLocaleString("id-ID")}`;
    }
    return { text: label, callback_data: `pkg_${pkg.id}` };
  });

  const rows: TelegramBot.InlineKeyboardButton[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  const navRow: TelegramBot.InlineKeyboardButton[] = [];
  if (page > 0)
    navRow.push({ text: "⬅ Sebelumnya", callback_data: `page_${page - 1}` });
  if (page < totalPages - 1)
    navRow.push({ text: "Selanjutnya ➡", callback_data: `page_${page + 1}` });
  if (navRow.length > 0) rows.push(navRow);

  rows.push([
    { text: "🔙 Kembali ke Kategori", callback_data: "back_category" },
  ]);

  return { inline_keyboard: rows };
}

export function confirmOrderKeyboard(
  packageId: string,
): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Konfirmasi Order", callback_data: `confirm_${packageId}` },
        { text: "❌ Batal", callback_data: "cancel_order" },
      ],
    ],
  };
}

export function paymentMethodKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "💳 PAKAI SALDO", callback_data: "paysaldo" }],
      [{ text: "📱 BAYAR LANGSUNG (QRIS)", callback_data: "payqris" }],
      [{ text: "❌ Batal", callback_data: "cancel_order" }],
    ],
  };
}

export function backToCategoryKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🔙 Kembali ke Kategori", callback_data: "back_category" }],
    ],
  };
}
