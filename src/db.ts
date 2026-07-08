import pkg from "@prisma/client";

// Support environments where @prisma/client may not export named bindings
const { PrismaClient } = (pkg as any);

export const prisma = new PrismaClient();