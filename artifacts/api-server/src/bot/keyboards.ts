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
  pageSize = 5,
): TelegramBot.InlineKeyboardMarkup {
  const start = page * pageSize;
  const end = start + pageSize;
  const pageItems = packages.slice(start, end);
  const totalPages = Math.ceil(packages.length / pageSize);

  const rows: TelegramBot.InlineKeyboardButton[][] = pageItems.map((pkg) => {
    let label: string;
    if (pkg.source === "api2" && pkg.sku) {
      const stockText = pkg.stock !== undefined ? `${pkg.stock} stok` : "stok N/A";
      label = `${pkg.sku} (${stockText}) — Rp ${pkg.price.toLocaleString("id-ID")}`;
    } else {
      label = `${pkg.name} — Rp ${pkg.price.toLocaleString("id-ID")} | ${pkg.quota} | ${pkg.validity}`;
    }
    return [{ text: label, callback_data: `pkg_${pkg.id}` }];
  });

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

export function backToCategoryKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🔙 Kembali ke Kategori", callback_data: "back_category" }],
    ],
  };
}
