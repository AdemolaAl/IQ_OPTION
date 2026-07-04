import crypto from "node:crypto";

const SECRET = process.env.SESSION_SECRET!;
if (!SECRET) throw new Error("SESSION_SECRET not set");

const TTL_SECONDS = 60 * 60 * 4; // 4 hours

export function issueToken(telegramId: number): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${telegramId}.${exp}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): { telegramId: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [tgId, exp, sig] = parts;
  const payload = `${tgId}.${exp}`;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null;
  return { telegramId: Number(tgId) };
}