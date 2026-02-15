// my-app/app/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

// ✅ Use globalThis instead of global (works in Node safely)
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

