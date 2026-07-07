import { prisma } from "./db.js";

const ADMIN_TELEGRAM_ID = 8804781360n; // ← your Telegram ID (from your screenshot URL)

export async function seed() {
  await prisma.appSetting.upsert({
    where: { key: "access_code" },
    update: {},
    create: { key: "access_code", value: "WELCOME2026" },
  });

  await prisma.user.updateMany({
    where: { telegramId: ADMIN_TELEGRAM_ID },
    data: { isAdmin: true, hasAccess: true },
  });
}