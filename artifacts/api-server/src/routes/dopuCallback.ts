import { Router } from "express";
import { logger } from "../lib/logger";
import { getOrderByReffId, updateOrderStatus } from "../bot/orders";
import { updateSaldo, getUser } from "../bot/users";
import { getBot } from "../bot/index";

const router = Router();

const DOPU_SECRET = process.env.DOPU_CALLBACK_SECRET ?? "";

function verifyDopuSecret(req: any, res: any): boolean {
  if (!DOPU_SECRET) return true;
  const token = (req.query.secret as string) ?? req.headers["x-dopu-secret"] ?? "";
  if (token !== DOPU_SECRET) {
    logger.warn({ ip: req.ip }, "DOPU callback: invalid secret");
    res.status(401).json({ status: "unauthorized" });
    return false;
  }
  return true;
}

async function handleDopuCallback(data: Record<string, any>) {
  logger.info({ data }, "DOPU callback received");

  const reffId = String(
    data.refID ?? data.reffid ?? data.ref_id ?? data.refid ?? data.reffId ?? ""
  ).trim();
  const rawStatus = String(data.status ?? "").trim();
  const message = String(data.message ?? data.pesan ?? "").trim();
  const sn = String(data.sn ?? data.serialnumber ?? data.serial ?? data.trxID ?? "").trim();
  const msgUpper = message.toUpperCase();

  if (!reffId) {
    logger.warn({ data }, "DOPU callback missing refID — ignoring");
    return;
  }

  const order = getOrderByReffId(reffId);
  if (!order) {
    logger.warn({ reffId }, "DOPU callback: no matching order");
    return;
  }

  if (order.status === "done" || order.status === "cancelled") {
    logger.info({ reffId, orderId: order.id, status: order.status }, "DOPU callback: already finalized");
    return;
  }

  const isSuccess =
    msgUpper.includes("SUKSES") ||
    msgUpper.includes("SUCCESS") ||
    msgUpper.includes("BERHASIL") ||
    (rawStatus === "1" && !msgUpper.includes("PROSES") && !msgUpper.includes("ANTRI") && !msgUpper.includes("PENDING"));

  const isFailed =
    rawStatus === "0" ||
    msgUpper.includes("GAGAL") ||
    msgUpper.includes("FAILED") ||
    msgUpper.includes("BATAL");

  const bot = getBot();
  const chatId = order.userId;

  if (isSuccess) {
    const finalSn = sn || order.sn || reffId;
    updateOrderStatus(order.id, "done", finalSn || undefined);
    logger.info({ reffId, orderId: order.id, finalSn }, "DOPU callback: order done");

    if (bot) {
      const finalUser = getUser(order.userId);
      const circleNote = order.category === "circle"
        ? `\n\n📱 Buka aplikasi MyXL → konfirmasi undangan Circle yang masuk ke nomor tujuan.`
        : "";
      try {
        await bot.sendMessage(
          chatId,
          `✅ <b>ORDER BERHASIL!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📦 Produk: <b>${order.packageName}</b>\n` +
          `📱 Nomor: <code>${order.nomorTujuan ?? "-"}</code>\n` +
          `💰 Harga: <b>Rp ${order.price.toLocaleString("id-ID")}</b>\n` +
          (finalSn ? `🔑 SN: <code>${finalSn}</code>\n` : "") +
          `🔖 Ref: <code>${reffId}</code>\n` +
          (finalUser ? `\n• Saldo tersisa: <b>Rp ${finalUser.saldo.toLocaleString("id-ID")}</b>` : "") +
          circleNote,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        logger.error({ err, chatId }, "DOPU callback: failed to notify user (success)");
      }
    }
    return;
  }

  if (isFailed) {
    updateOrderStatus(order.id, "cancelled");
    const refunded = updateSaldo(order.userId, order.price);
    logger.info({ reffId, orderId: order.id }, "DOPU callback: order cancelled — saldo refunded");

    if (bot) {
      const errMsg = message.length > 0 ? message.slice(0, 120) : "Transaksi gagal";
      try {
        await bot.sendMessage(
          chatId,
          `❌ <b>ORDER GAGAL</b>\n\n` +
          `📦 Produk: <b>${order.packageName}</b>\n` +
          `📱 Nomor: <code>${order.nomorTujuan ?? "-"}</code>\n\n` +
          `⚠️ ${errMsg}\n` +
          `🔖 Ref: <code>${reffId}</code>\n\n` +
          `💰 Saldo <b>Rp ${order.price.toLocaleString("id-ID")}</b> telah dikembalikan.\n` +
          `Saldo sekarang: <b>Rp ${(refunded?.saldo ?? 0).toLocaleString("id-ID")}</b>`,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        logger.error({ err, chatId }, "DOPU callback: failed to notify user (failed)");
      }
    }
    return;
  }

  logger.info({ reffId, rawStatus, message }, "DOPU callback: status unclear — still pending");
}

// Support both path variants: /dopu/callback (legacy) and /webhook/dopu (canonical)
router.all("/dopu/callback", async (req, res) => {
  if (!verifyDopuSecret(req, res)) return;
  res.status(200).json({ status: "ok" });
  await handleDopuCallback({ ...req.query, ...req.body });
});

router.post("/webhook/dopu", async (req, res) => {
  if (!verifyDopuSecret(req, res)) return;
  res.status(200).json({ status: "ok" });
  await handleDopuCallback({ ...req.query, ...req.body });
});

router.get("/webhook/dopu", async (req, res) => {
  if (!verifyDopuSecret(req, res)) return;
  res.status(200).json({ status: "ok" });
  await handleDopuCallback(req.query as Record<string, any>);
});

export default router;
