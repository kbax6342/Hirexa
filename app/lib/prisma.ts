// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

import {
  decryptSensitiveUserProfileFields,
  encryptSensitiveUserProfileFields,
} from "@/app/lib/security/profileEncryption";

function encryptUserProfileArgs<T extends Record<string, unknown>>(args: T): T {
  const nextArgs = { ...args } as Record<string, unknown>;

  if ("data" in nextArgs) {
    nextArgs.data = encryptSensitiveUserProfileFields(nextArgs.data);
  }

  if ("create" in nextArgs) {
    nextArgs.create = encryptSensitiveUserProfileFields(nextArgs.create);
  }

  if ("update" in nextArgs) {
    nextArgs.update = encryptSensitiveUserProfileFields(nextArgs.update);
  }

  return nextArgs as T;
}

function createPrismaClient() {
  return new PrismaClient().$extends({
    query: {
      userProfile: {
        async findUnique({ args, query }) {
          return decryptSensitiveUserProfileFields(await query(args));
        },
        async findUniqueOrThrow({ args, query }) {
          return decryptSensitiveUserProfileFields(await query(args));
        },
        async findFirst({ args, query }) {
          return decryptSensitiveUserProfileFields(await query(args));
        },
        async findFirstOrThrow({ args, query }) {
          return decryptSensitiveUserProfileFields(await query(args));
        },
        async findMany({ args, query }) {
          return decryptSensitiveUserProfileFields(await query(args));
        },
        async create({ args, query }) {
          return decryptSensitiveUserProfileFields(
            await query(encryptUserProfileArgs(args))
          );
        },
        async createMany({ args, query }) {
          return query(encryptUserProfileArgs(args));
        },
        async update({ args, query }) {
          return decryptSensitiveUserProfileFields(
            await query(encryptUserProfileArgs(args))
          );
        },
        async updateMany({ args, query }) {
          return query(encryptUserProfileArgs(args));
        },
        async upsert({ args, query }) {
          return decryptSensitiveUserProfileFields(
            await query(encryptUserProfileArgs(args))
          );
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
