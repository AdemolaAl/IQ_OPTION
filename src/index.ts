import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { Bot } from "grammy";
import { verifyInitData } from "./verifyInitData.js";
import { issueToken, verifyToken } from "./token.js";
import { iqClient } from "./iqClient.js";
import { prisma } from "./db.js";
import { broadcastSignal, executeSignal } from "./signal.js";

const BOT_TOKEN = process.env.BOT_TOKEN!;
const WEB_APP_URL = process.env.WEB_APP_URL!;
const PORT = Number(process.env.PORT ?? 3000);

if (!BOT_TOKEN || !WEB_APP_URL) throw new Error("missing required env");

const bot = new Bot(BOT_TOKEN);
bot.command("start", async (ctx) => {
  const name = ctx.from?.first_name ?? "there";
  await ctx.reply(
    `👋 Hey ${name}, welcome to IQBOTIX!\n\n` +
      `Trade IQ Option straight from Telegram — check your balance, place trades, and stay in control.\n\n` +
      `Tap below to get started 👇`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Open App", web_app: { url: WEB_APP_URL } }],
          [{ text: "ℹ️ How it works", callback_data: "help" }],
        ],
      },
    }
  );
});

bot.callbackQuery("help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `📘 *How IQBOTIX works*\n\n` +
      `1️⃣ Tap *Open App* to launch the trading dashboard\n` +
      `2️⃣ Connect your IQ Option account (use a demo first!)\n` +
      `3️⃣ Pick an asset, set your amount, and trade\n\n` +
      `⚠️ Only use a *demo account* while getting familiar. ` +
      `Automated trading via unofficial APIs carries risk.\n\n` +
      `Need help? Just message this bot.`,
    { parse_mode: "Markdown" }
  );
});

bot.command("setcode", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user?.isAdmin) return ctx.reply("⛔ Admins only");

  const newCode = ctx.match?.trim();
  if (!newCode) return ctx.reply("Usage: /setcode YOURNEWCODE");

  await prisma.appSetting.update({ where: { key: "access_code" }, data: { value: newCode } });
  ctx.reply(`✅ Access code updated to: \`${newCode}\``, { parse_mode: "Markdown" });
});

// Format: /signal EURUSD-OTC call 1
// Or with schedule: /signal EURUSD-OTC put 5 21:30
bot.command("signal", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from!.id) } });
  if (!user?.isAdmin) return ctx.reply("⛔ Admins only");

  const parts = ctx.match?.trim().split(/\s+/) ?? [];
  if (parts.length < 3) {
    return ctx.reply("Usage: /signal ASSET call|put MINUTES [HH:MM]\nExample: /signal EURUSD-OTC call 1");
  }

  const [asset, direction, durationStr, timeStr] = parts;
  if (!["call", "put"].includes(direction)) return ctx.reply("Direction must be call or put");
  const duration = Number(durationStr);
  if (![1, 5, 15].includes(duration)) return ctx.reply("Duration must be 1, 5, or 15");

  let executeAt: Date | null = null;
  if (timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    executeAt = new Date();
    executeAt.setHours(h, m, 0, 0);
    if (executeAt < new Date()) executeAt.setDate(executeAt.getDate() + 1);
  }

  const signal = await prisma.signal.create({
    data: { asset: asset.toUpperCase(), direction, duration, executeAt, createdBy: BigInt(ctx.from!.id) },
  });

  await ctx.reply(
    `📡 Signal created\n\n` +
    `${direction === "call" ? "🟢 CALL" : "🔴 PUT"} ${signal.asset} · ${duration}m` +
    (executeAt ? `\n⏰ Executes at ${timeStr}` : `\n⚡ Executing now`)
  );

  if (!executeAt) await executeSignal(signal.id);
  await broadcastSignal(signal.id);
});

bot.callbackQuery(/^take:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const signalId = ctx.match[1];
  const signal = await prisma.signal.findUnique({ where: { id: signalId } });
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
  if (!signal || !user) return;

  const uid = String(user.telegramId);
  const r = await iqClient.placeOrder(uid, signal.asset, user.autoAmount, signal.direction as "call" | "put", signal.duration);

  await prisma.trade.create({
    data: {
      userId: user.id, signalId: signal.id, asset: signal.asset,
      amount: user.autoAmount, direction: signal.direction, duration: signal.duration,
      mode: "signal", status: r.ok ? "placed" : "failed",
      orderId: r.ok ? BigInt(r.data.order_id) : null,
    },
  });

  await ctx.reply(r.ok
    ? `✅ Trade placed: ${signal.direction.toUpperCase()} ${signal.asset} $${user.autoAmount}`
    : `❌ Failed: ${r.data.detail ?? "connect your IQ account in the app first"}`);
});

bot.start();









const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(rateLimit, { max: 60, timeWindow: "1 minute" });

// Extend request type
declare module "fastify" {
  interface FastifyRequest { telegramId?: number; }
}

// Auth hook for /api/iq/*
app.addHook("preHandler", async (req, reply) => {
  if (!req.url.startsWith("/api/iq/")) return;
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return reply.code(401).send({ error: "no token" });
  const payload = verifyToken(token);
  if (!payload) return reply.code(401).send({ error: "invalid or expired token" });
  req.telegramId = payload.telegramId;
});

app.get("/health", async () => ({ ok: true }));


app.post<{ Body: { autoTrade?: boolean; autoAmount?: number } }>("/api/settings", async (req) => {
  const user = (req as any).dbUser;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(req.body.autoTrade !== undefined && { autoTrade: req.body.autoTrade }),
      ...(req.body.autoAmount !== undefined && { autoAmount: Math.max(1, req.body.autoAmount) }),
    },
  });
  return { autoTrade: updated.autoTrade, autoAmount: updated.autoAmount };
});

app.get("/api/signals/active", async () => {
  return prisma.signal.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
});

app.post<{ Body: { initData: string } }>("/api/auth", async (req, reply) => {
  const tgUser = verifyInitData(req.body.initData, BOT_TOKEN);
  if (!tgUser) return reply.code(401).send({ error: "invalid initData" });

  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(tgUser.id) },
    update: { firstName: tgUser.first_name, username: tgUser.username },
    create: { telegramId: BigInt(tgUser.id), firstName: tgUser.first_name, username: tgUser.username },
  });

  const token = issueToken(tgUser.id);
  return {
    token,
    user: {
      id: tgUser.id,
      first_name: tgUser.first_name,
      hasAccess: user.hasAccess,
      isAdmin: user.isAdmin,
      autoTrade: user.autoTrade,
    },
  };
});
// ---- IQ routes (all guarded by preHandler) ----

setInterval(async () => {
  const due = await prisma.signal.findMany({
    where: { status: "active", executeAt: { lte: new Date() } },
  });
  for (const s of due) await executeSignal(s.id);
}, 10_000); // check every 10s


app.post<{ Body: { email: string; password: string; account_type?: string } }>(
  "/api/iq/connect",
  async (req, reply) => {
    const uid = String(req.telegramId);
    const r = await iqClient.login(uid, req.body.email, req.body.password, req.body.account_type);
    if (!r.ok) return reply.code(r.status).send(r.data);
    return r.data;
  }
);

app.get("/api/iq/balance", async (req, reply) => {
  const uid = String(req.telegramId);
  const r = await iqClient.balance(uid);
  if (!r.ok) return reply.code(r.status).send(r.data);
  return r.data;
});

app.post<{ Body: { asset: string; amount: number; direction: "call" | "put"; duration: number } }>(
  "/api/iq/order",
  async (req, reply) => {
    const uid = String(req.telegramId);
    const r = await iqClient.placeOrder(uid, req.body.asset, req.body.amount, req.body.direction, req.body.duration);
    if (!r.ok) return reply.code(r.status).send(r.data);
    return r.data;
  }
);

app.post("/api/iq/disconnect", async (req) => {
  const uid = String(req.telegramId);
  await iqClient.logout(uid);
  return { ok: true };
});


app.post<{ Body: { code: string, initData: string } }>("/api/access/verify", async (req, reply) => {
  const tgUser = verifyInitData(req.body.initData, BOT_TOKEN);
  if (!tgUser) return reply.code(401).send({ error: "invalid initData" });

  
  const tgId = BigInt( tgUser.id );
  const setting = await prisma.appSetting.findUnique({ where: { key: "access_code" } });
  if (!setting || req.body.code.trim() !== setting.value) {
    return reply.code(403).send({ error: "Invalid access code" });
  }
  await prisma.user.update({ where: { telegramId: tgId }, data: { hasAccess: true } });
  return { ok: true };
});

app.addHook("preHandler", async (req, reply) => {
  if (!req.url.startsWith("/api/iq/") && !req.url.startsWith("/api/signals")) return;
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return reply.code(401).send({ error: "no token" });
  const payload = verifyToken(token);
  if (!payload) return reply.code(401).send({ error: "invalid token" });
  req.telegramId = payload.telegramId;

  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(payload.telegramId) } });
  if (!user?.hasAccess) return reply.code(403).send({ error: "access code required" });
  (req as any).dbUser = user;
});

app.post<{ Body: { signalId: string; amount: number } }>("/api/signals/take", async (req, reply) => {
  const user = (req as any).dbUser;
  const signal = await prisma.signal.findUnique({ where: { id: req.body.signalId } });
  if (!signal) return reply.code(404).send({ error: "signal not found" });

  const amount = Math.max(1, Math.min(req.body.amount, 100)); // server-side cap
  const r = await iqClient.placeOrder(String(user.telegramId), signal.asset, amount, signal.direction as "call" | "put", signal.duration);

  await prisma.trade.create({
    data: {
      userId: user.id, signalId: signal.id, asset: signal.asset,
      amount, direction: signal.direction, duration: signal.duration,
      mode: "signal", status: r.ok ? "placed" : "failed",
      orderId: r.ok ? BigInt(r.data.order_id) : null,
    },
  });

  if (!r.ok) return reply.code(r.status).send(r.data);
  return r.data;
});


app.listen({ port: PORT, host: "0.0.0.0" });