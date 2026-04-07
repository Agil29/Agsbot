import TelegramBot from "node-telegram-bot-api";
import { type PackageItem } from "./store";

export type MainMenuOpts = {
  cekPaketUrl?: string;
};

export function mainMenuKeyboard(
  opts: MainMenuOpts & { isAdmin?: boolean } = {},
): TelegramBot.ReplyKeyboardMarkup {
  const keyboard: TelegramBot.KeyboardButton[][] = [
    [{ text: "📦 ORDER" }],
    [{ text: "💰 TOPUP" }, { text: "📋 RIWAYAT" }],
    [{ text: "📱 CEK PAKET & AREA", web_app: { url: "https://bendith.my.id/" } }],
    [{ text: "🏠 Menu" }],
  ];

  if (opts.isAdmin) {
    keyboard.push([{ text: "📢 BROADCAST" }]);
  }

  return {
    keyboard,
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

export function categoryInlineKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "AKRAB V1", callback_data: "cat_akrab1" },
        { text: "AKRAB V2", callback_data: "cat_akrab2" },
      ],
      [{ text: "CIRCLE (XL ONLY)", callback_data: "cat_circle" }],
    ],
  };
}

export type PackageKeyboardOpts = {
  columns?: number;
  cekStokUrl?: string;
  pageSize?: number;
  showRefreshStock?: boolean;
};

export function packageInlineKeyboard(
  packages: PackageItem[],
  page = 0,
  opts: PackageKeyboardOpts = {},
): TelegramBot.InlineKeyboardMarkup {
  // Separate Digiflaz packages (shown next to Cek Stok) from the regular grid
  const digiflazPkgs = packages.filter((p) => p.source === "digiflaz");
  const gridPkgs = packages.filter((p) => p.source !== "digiflaz");

  const columns = opts.columns ?? 2;
  const effectivePageSize =
    opts.pageSize ?? (columns === 3 ? gridPkgs.length : 6);
  const start = page * effectivePageSize;
  const end = start + effectivePageSize;
  const pageItems = gridPkgs.slice(start, end);
  const totalPages = Math.ceil(gridPkgs.length / effectivePageSize);

  const buttons: TelegramBot.InlineKeyboardButton[] = pageItems.map((pkg) => {
    let label: string;
    if (pkg.source === "api2") {
      const stockText = pkg.stock && pkg.stock > 0 ? `✅` : "❌";
      label = `${pkg.name} ${stockText}`;
      if (pkg.price > 0) label += ` — Rp ${pkg.price.toLocaleString("id-ID")}`;
    } else if (pkg.source === "dopu") {
      label = pkg.name;
      if (pkg.price > 0) label += ` — Rp ${pkg.price.toLocaleString("id-ID")}`;
    } else {
      label = `${pkg.name} — Rp ${pkg.price.toLocaleString("id-ID")}`;
    }
    return { text: label, callback_data: `pkg_${pkg.id}` };
  });

  const rows: TelegramBot.InlineKeyboardButton[][] = [];

  // Top row: Cek Stok + Digiflaz shortcut buttons side by side
  if (opts.cekStokUrl) {
    const topRow: TelegramBot.InlineKeyboardButton[] = [
      { text: "📊 Cek Stok", web_app: { url: opts.cekStokUrl } },
      ...digiflazPkgs.map((pkg) => ({
        text: pkg.name + (pkg.price > 0 ? ` — Rp ${pkg.price.toLocaleString("id-ID")}` : ""),
        callback_data: `pkg_${pkg.id}`,
      })),
    ];
    rows.push(topRow);
  } else if (digiflazPkgs.length > 0) {
    // No cekStokUrl but still have digiflaz packages — show them in their own row
    rows.push(digiflazPkgs.map((pkg) => ({
      text: pkg.name + (pkg.price > 0 ? ` — Rp ${pkg.price.toLocaleString("id-ID")}` : ""),
      callback_data: `pkg_${pkg.id}`,
    })));
  }

  // Package grid
  for (let i = 0; i < buttons.length; i += columns) {
    rows.push(buttons.slice(i, i + columns));
  }

  // Pagination
  const navRow: TelegramBot.InlineKeyboardButton[] = [];
  if (page > 0)
    navRow.push({ text: "⬅ Sebelumnya", callback_data: `page_${page - 1}` });
  if (page < totalPages - 1)
    navRow.push({ text: "Selanjutnya ➡", callback_data: `page_${page + 1}` });
  if (navRow.length > 0) rows.push(navRow);

  if (opts.showRefreshStock) {
    rows.push([{ text: "🔄 Refresh Stock", callback_data: "refresh_stock" }]);
  }

  rows.push([
    { text: "🔙 Kembali ke Kategori", callback_data: "back_category" },
  ]);

  return { inline_keyboard: rows };
}

export function confirmOrderKeyboard(
  packageId: string,
  showBackToList = false,
): TelegramBot.InlineKeyboardMarkup {
  const rows: TelegramBot.InlineKeyboardButton[][] = [
    [
      { text: "✅ Konfirmasi Order", callback_data: `confirm_${packageId}` },
      { text: "❌ Batal", callback_data: "cancel_order" },
    ],
  ];
  if (showBackToList) {
    rows.push([{ text: "🔙 Kembali ke List", callback_data: "back_to_list" }]);
  }
  return { inline_keyboard: rows };
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
