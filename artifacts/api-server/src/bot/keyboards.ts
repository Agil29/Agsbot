import TelegramBot from "node-telegram-bot-api";
import { type PackageItem } from "./store";

export function mainMenuKeyboard(cekPaketUrl?: string): TelegramBot.ReplyKeyboardMarkup {
  const cekPaketBtn: TelegramBot.KeyboardButton = cekPaketUrl
    ? { text: "📱 CEK PAKET", web_app: { url: cekPaketUrl } }
    : { text: "📱 CEK PAKET" };

  return {
    keyboard: [
      [{ text: "📦 ORDER" }],
      [{ text: "💰 TOPUP" }, { text: "📋 RIWAYAT TRANSAKSI" }],
      [{ text: "📊 CEK STOK" }, cekPaketBtn],
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

export type PackageKeyboardOpts = {
  columns?: number;
  cekStokUrl?: string;
  pageSize?: number;
};

export function packageInlineKeyboard(
  packages: PackageItem[],
  page = 0,
  opts: PackageKeyboardOpts = {},
): TelegramBot.InlineKeyboardMarkup {
  const columns = opts.columns ?? 2;
  const effectivePageSize = opts.pageSize ?? (columns === 3 ? packages.length : 6);
  const start = page * effectivePageSize;
  const end = start + effectivePageSize;
  const pageItems = packages.slice(start, end);
  const totalPages = Math.ceil(packages.length / effectivePageSize);

  const buttons: TelegramBot.InlineKeyboardButton[] = pageItems.map((pkg) => {
    let label: string;
    if (pkg.source === "api2" || pkg.source === "dopu") {
      const stockText = pkg.stock && pkg.stock > 0
        ? (pkg.source === "api2" ? `✅ ${pkg.stock}` : `✅`)
        : "❌";
      label = `${pkg.name} ${stockText}`;
      if (pkg.price > 0) label += ` — Rp ${pkg.price.toLocaleString("id-ID")}`;
    } else {
      label = `${pkg.name} — Rp ${pkg.price.toLocaleString("id-ID")}`;
    }
    return { text: label, callback_data: `pkg_${pkg.id}` };
  });

  const rows: TelegramBot.InlineKeyboardButton[][] = [];

  // Optional Cek Stok URL button at top
  if (opts.cekStokUrl) {
    rows.push([{ text: "🔍 Cek Stok & Kuota", url: opts.cekStokUrl }]);
  }

  // Package buttons grid
  for (let i = 0; i < buttons.length; i += columns) {
    rows.push(buttons.slice(i, i + columns));
  }

  // Nav row
  const navRow: TelegramBot.InlineKeyboardButton[] = [];
  if (page > 0) navRow.push({ text: "⬅ Sebelumnya", callback_data: `page_${page - 1}` });
  if (page < totalPages - 1) navRow.push({ text: "Selanjutnya ➡", callback_data: `page_${page + 1}` });
  if (navRow.length > 0) rows.push(navRow);

  rows.push([{ text: "🔄 Refresh Stok", callback_data: "refresh_stock" }]);
  rows.push([{ text: "🔙 Kembali ke Kategori", callback_data: "back_category" }]);

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
