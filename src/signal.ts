import { prisma } from "./db.js";
import { iqClient } from "./iqClient.js";
import { Bot } from "grammy";

let bot: Bot;
export function initSignals(b: Bot) { bot = b; }

export async function broadcastSignal(signalId: string) {
  const signal = await prisma.signal.findUnique({ where: { id: signalId } });
  if (!signal) return;

  const users = await prisma.user.findMany({ where: { hasAccess: true } });
  const text =
    `📡 *New Signal*\n\n` +
    `${signal.direction === "call" ? "🟢 CALL" : "🔴 PUT"} *${signal.asset}* · ${signal.duration}m\n` +
    (signal.executeAt ? `⏰ ${signal.executeAt.toLocaleTimeString()}` : `⚡ Now`);

  for (const u of users) {
    try {
      await bot.api.sendMessage(String(u.telegramId), text, {
        parse_mode: "Markdown",
        reply_markup: u.autoTrade ? undefined : {
          inline_keyboard: [[{ text: "⚡ Take this trade", callback_data: `take:${signal.id}` }]],
        },
      });
    } catch { /* user blocked bot etc */ }
  }
}

export async function executeSignal(signalId: string) {
  const signal = await prisma.signal.findUnique({ where: { id: signalId } });
  if (!signal || signal.status !== "active") return;

  const autoUsers = await prisma.user.findMany({ where: { hasAccess: true, autoTrade: true } });

  for (const u of autoUsers) {
    const uid = String(u.telegramId);
    const r = await iqClient.placeOrder(uid, signal.asset, u.autoAmount, signal.direction as "call" | "put", signal.duration);

    await prisma.trade.create({
      data: {
        userId: u.id,
        signalId: signal.id,
        asset: signal.asset,
        amount: u.autoAmount,
        direction: signal.direction,
        duration: signal.duration,
        mode: "auto",
        status: r.ok ? "placed" : "failed",
        orderId: r.ok ? BigInt(r.data.order_id) : null,
      },
    });

    try {
      await bot.api.sendMessage(uid, r.ok
        ? `✅ Auto-trade placed: ${signal.direction.toUpperCase()} ${signal.asset} $${u.autoAmount}`
        : `❌ Auto-trade failed: ${r.data.detail ?? "not connected"}`);
    } catch {}
  }

  await prisma.signal.update({ where: { id: signalId }, data: { status: "executed" } });
}