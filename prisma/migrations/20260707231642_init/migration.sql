-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "firstName" TEXT NOT NULL,
    "username" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "hasAccess" BOOLEAN NOT NULL DEFAULT false,
    "autoTrade" BOOLEAN NOT NULL DEFAULT false,
    "autoAmount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "executeAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "createdBy" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signalId" TEXT,
    "orderId" BIGINT,
    "asset" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "direction" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'placed',
    "profit" DOUBLE PRECISION,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "Trade_userId_placedAt_idx" ON "Trade"("userId", "placedAt");

-- CreateIndex
CREATE INDEX "Trade_signalId_idx" ON "Trade"("signalId");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
