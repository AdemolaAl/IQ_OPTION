import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { Bot } from "grammy";
import { verifyInitData } from "./verifyInitData.js";
import { issueToken, verifyToken } from "./token.js";
import { iqClient } from "./iqClient.js";

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

app.post<{ Body: { initData: string } }>("/api/auth", async (req, reply) => {
  const user = verifyInitData(req.body.initData, BOT_TOKEN);
  if (!user) return reply.code(401).send({ error: "invalid initData" });
  const token = issueToken(user.id);
  return { token, user };
});

// ---- IQ routes (all guarded by preHandler) ----

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

app.listen({ port: PORT, host: "0.0.0.0" });