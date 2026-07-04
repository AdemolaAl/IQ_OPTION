import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { Bot } from "grammy";
import { verifyInitData } from "./verifyInitData.js";
import { iqClient } from "./iqClient.js";

const BOT_TOKEN = process.env.BOT_TOKEN!;
const WEB_APP_URL = process.env.WEB_APP_URL!;
const PORT = Number(process.env.PORT ?? 3000);

// --- Bot ---
const bot = new Bot(BOT_TOKEN);

bot.command("start", (ctx) =>
  ctx.reply("Welcome! Tap below to open the app.", {
    reply_markup: {
      inline_keyboard: [[{ text: "🚀 Open App", web_app: { url: WEB_APP_URL } }]],
    },
  })
);

bot.start();

// --- API ---
const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true }));

app.post<{ Body: { initData: string } }>("/api/auth", async (req, reply) => {
  const user = verifyInitData(req.body.initData, BOT_TOKEN);
  if (!user) return reply.code(401).send({ error: "invalid initData" });
  return { user };
});

app.post<{ Body: { email: string; password: string } }>("/api/iq/login", async (req) => {
  return iqClient.login(req.body.email, req.body.password);
});

app.get("/api/iq/balance", async () => iqClient.balance());

app.post<{ Body: { asset: string; amount: number; direction: "call" | "put"; duration: number } }>(
  "/api/iq/order",
  async (req) => iqClient.placeOrder(req.body.asset, req.body.amount, req.body.direction, req.body.duration)
);

app.listen({ port: PORT, host: "0.0.0.0" });