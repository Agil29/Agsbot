import TelegramBot from "node-telegram-bot-api";
import QRCode from "qrcode";
import { logger } from "../lib/logger";
import { getPackages, type Category } from "./store";
import { getSession, setSession, clearSession } from "./sessions";
import { getOrRegisterUser, getUser, formatRegDate } from "./users";
import { createOrder, getOrdersByUser, formatOrderDate, statusLabel } from "./orders";
import { createPakasirTopup, getTopupById, updateTopupStatus, calculateFee } from "./topup";
import {
  mainMenuKeyboard,
  categoryInlineKeyboard,
  packageInlineKeyboard,
  confirmOrderKeyboard,
  backToCategoryKeyboard,
} from "./keyboards";

const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME ?? "Agsstore_29";
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

async function sendTopupQR(bot: TelegramBot, chatId: number, userId: number, nominal: number) {
  const user = getUser(userId);
  const userName = user ? user.firstName + (user.lastName ? " " + user.lastName : "") : String(userId);

  await bot.sendMessage(chatId, "⏳ <b>Membuat QRIS...</b>\n\nMohon tunggu sebentar.", { parse_mode: "HTML" });

  const result = await createPakasirTopup({ userId, chatId, userName, nominal });

  if ("error" in result) {
    await bot.sendMessage(chatId, `❌ ${result.error}`, { parse_mode: "HTML" });
    return;
  }

  const { order, qrisString } = result;
  const expiryMinutes = 7;

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
    `<i>Scan QR di atas menggunakan aplikasi pembayaran QRIS (GoPay, OVO, Dana, dll).</i>\n\n` +
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
  bot.onText(/\/start/, async (msg) => {
    const from = msg.from!;
    const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);
    clearSession(from.id);
    await bot.sendMessage(msg.chat.id, buildProfileText(user), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.onText(/🏠 Menu/, async (msg) => {
    const from = msg.from!;
    const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);
    clearSession(from.id);
    await bot.sendMessage(msg.chat.id, buildProfileText(user), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.onText(/\/order/, handleOrder(bot));
  bot.onText(/📦 ORDER/, handleOrder(bot));

  bot.onText(/💰 TOPUP/, async (msg) => {
    const from = msg.from!;
    const user = getOrRegisterUser(from.id, from.first_name, from.last_name, from.username);
    setSession(from.id, { step: "waiting_topup_amount" });

    await bot.sendMessage(
      msg.chat.id,
      `💳 <b>TOPUP SALDO</b>\n\nSaldo Anda: <b>Rp ${user.saldo.toLocaleString("id-ID")}</b>\n\n` +
      `Silakan masukkan jumlah saldo yang ingin diisi.\nContoh: <code>10000</code>`,
      { parse_mode: "HTML" }
    );
  });

  bot.onText(/📋 RIWAYAT TRANSAKSI/, async (msg) => {
    const from = msg.from!;
    const userOrders = getOrdersByUser(from.id);

    if (userOrders.length === 0) {
      await bot.sendMessage(
        msg.chat.id,
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
    await bot.sendMessage(msg.chat.id, text, { parse_mode: "HTML" });
  });

  bot.onText(/📊 CEK STOK/, async (msg) => {
    const chatId = msg.chat.id;
    if (CEK_STOK_URL) {
      await bot.sendMessage(chatId, "📊 <b>CEK STOK</b>\n\nKlik tombol di bawah untuk melihat stok:", {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "📊 Buka Cek Stok", web_app: { url: CEK_STOK_URL } }]] },
      });
    } else {
      const akrab1 = getPackages("akrab1");
      const akrab2 = getPackages("akrab2");
      const circle = getPackages("circle");

      let akrab2StokDetail = "";
      if (akrab2.length > 0) {
        const lines = akrab2.map((p) => {
          const sku = p.sku ?? p.name;
          const stok = p.stock !== undefined ? p.stock : "-";
          return `  • ${sku}: <b>${stok}</b>`;
        });
        akrab2StokDetail = "\n" + lines.join("\n");
      }

      await bot.sendMessage(chatId,
        `📊 <b>CEK STOK PAKET</b>\n\n` +
        `🟢 AKRAB 1: <b>${akrab1.length}</b> paket tersedia\n` +
        `🔵 CIRCLE: <b>${circle.length}</b> paket tersedia\n\n` +
        `🟡 <b>AKRAB 2:</b>${akrab2.length > 0 ? akrab2StokDetail : " Belum tersedia"}`,
        { parse_mode: "HTML" }
      );
    }
  });

  bot.onText(/📱 CEK PAKET/, async (msg) => {
    const chatId = msg.chat.id;
    if (CEK_PAKET_URL) {
      await bot.sendMessage(chatId, "📱 <b>CEK PAKET</b>\n\nKlik tombol di bawah:", {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "📱 Buka Cek Paket", web_app: { url: CEK_PAKET_URL } }]] },
      });
    } else {
      handleOrder(bot)(msg);
    }
  });

  bot.onText(/📍 CEK LOKASI/, async (msg) => {
    const chatId = msg.chat.id;
    if (CEK_LOKASI_URL) {
      await bot.sendMessage(chatId, "📍 <b>CEK LOKASI</b>\n\nKlik tombol di bawah:", {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "📍 Buka Cek Lokasi", web_app: { url: CEK_LOKASI_URL } }]] },
      });
    } else {
      await bot.sendMessage(chatId,
        `📍 <b>CEK LOKASI</b>\n\nMiniapp lokasi belum tersedia. Hubungi @${SUPPORT_USERNAME}`,
        { parse_mode: "HTML" }
      );
    }
  });

  bot.on("message", async (msg) => {
    if (!msg.text) return;
    const from = msg.from!;
    const session = getSession(from.id);

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

    try { await bot.answerCallbackQuery(query.id); } catch { }

    if (data.startsWith("topup_paid_")) {
      const topupId = data.replace("topup_paid_", "");
      const topup = getTopupById(topupId);

      if (!topup) {
        await bot.sendMessage(chatId, "❌ Order topup tidak ditemukan.", { parse_mode: "HTML" });
        return;
      }
      if (topup.status === "expired") {
        await bot.sendMessage(chatId, "⏰ Order ini sudah kadaluarsa.", { parse_mode: "HTML" });
        return;
      }
      if (topup.status !== "pending") {
        await bot.sendMessage(chatId, "✅ Order ini sudah diproses sebelumnya.", { parse_mode: "HTML" });
        return;
      }

      updateTopupStatus(topupId, "confirming");

      await bot.editMessageCaption(
        `✅ <b>Konfirmasi diterima!</b>\n\n` +
        `Order ID: <code>${topup.id}</code>\n` +
        `Nominal: <b>Rp ${topup.nominal.toLocaleString("id-ID")}</b>\n` +
        `Total: <b>Rp ${topup.total.toLocaleString("id-ID")}</b>\n\n` +
        `Admin akan memverifikasi pembayaran Anda.\n` +
        `Hubungi @${SUPPORT_USERNAME} jika ada kendala.`,
        { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
      );
      return;
    }

    if (data === "back_category") {
      setSession(userId, { step: "select_category", category: undefined, packageId: undefined });
      await bot.editMessageText("📦 <b>PILIH KATEGORI</b>\n\nSilakan pilih kategori paket yang tersedia:", {
        chat_id: chatId, message_id: messageId, parse_mode: "HTML",
        reply_markup: categoryInlineKeyboard(),
      });
      return;
    }

    if (data === "cancel_order") {
      clearSession(userId);
      await bot.editMessageText("❌ Order dibatalkan.\n\nKetik /order untuk memulai order baru.", {
        chat_id: chatId, message_id: messageId,
      });
      return;
    }

    if (data.startsWith("cat_")) {
      const category = data.replace("cat_", "") as Category;
      const packages = getPackages(category);
      setSession(userId, { step: "select_package", category });
      const categoryLabels: Record<Category, string> = { akrab1: "AKRAB 1", akrab2: "AKRAB 2", circle: "CIRCLE" };

      if (packages.length === 0) {
        await bot.editMessageText(
          `📦 <b>${categoryLabels[category]}</b>\n\n⚠️ Belum ada paket tersedia.\nHubungi admin: @${SUPPORT_USERNAME}`,
          { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: backToCategoryKeyboard() }
        );
        return;
      }
      await bot.editMessageText(
        `📦 <b>PAKET ${categoryLabels[category]}</b>\n\nPilih paket yang Anda inginkan:`,
        { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: packageInlineKeyboard(packages, 0) }
      );
      return;
    }

    if (data.startsWith("page_")) {
      const page = parseInt(data.replace("page_", ""), 10);
      const session = getSession(userId);
      const category = session.category as Category | undefined;
      if (!category) return;
      const packages = getPackages(category);
      await bot.editMessageReplyMarkup(packageInlineKeyboard(packages, page), { chat_id: chatId, message_id: messageId });
      return;
    }

    if (data.startsWith("pkg_")) {
      const packageId = data.replace("pkg_", "");
      const session = getSession(userId);
      const category = session.category as Category | undefined;
      if (!category) return;
      const packages = getPackages(category);
      const pkg = packages.find((p) => p.id === packageId);
      if (!pkg) { await bot.sendMessage(chatId, "❌ Paket tidak ditemukan."); return; }

      setSession(userId, {
        step: "confirm_order",
        packageId: pkg.id,
        selectedPackageName: pkg.name,
        selectedPackagePrice: pkg.price,
        selectedPackageQuota: pkg.quota,
        selectedPackageValidity: pkg.validity,
        selectedCategory: category,
      });

      const detailLines: string[] = [];
      if (pkg.source === "api2" && pkg.sku) {
        detailLines.push(`SKU: <b>${pkg.sku}</b>`);
        if (pkg.stock !== undefined) detailLines.push(`Stok: <b>${pkg.stock}</b>`);
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
        (pkg.description ? `${pkg.description}\n\n` : "") +
        `Konfirmasi order paket ini?`,
        { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: confirmOrderKeyboard(pkg.id) }
      );
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
        { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
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
    const userId = msg.from?.id ?? msg.chat.id;
    setSession(userId, { step: "select_category" });
    await bot.sendMessage(msg.chat.id, "📦 <b>PILIH KATEGORI</b>\n\nSilakan pilih kategori paket yang tersedia:", {
      parse_mode: "HTML",
      reply_markup: categoryInlineKeyboard(),
    });
  };
}
