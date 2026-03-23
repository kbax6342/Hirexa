// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

import { validateSecurityEnvironment } from "@/lib/security/env";
import {
  protectSensitiveText,
  revealSensitiveText,
} from "@/lib/security/secureFields";
import {
  decryptSensitiveUserProfileFields,
  encryptSensitiveUserProfileFields,
} from "@/app/lib/security/profileEncryption";

const LINKEDIN_ACCOUNT_PROTECTED_FIELDS = [
  "accessToken",
  "refreshToken",
] as const;
const JOB_HUNTER_PACK_PROTECTED_FIELDS = [
  "resumeText",
  "notes",
  "optimizedResume",
  "coverLetter",
  "interviewPrep",
] as const;

validateSecurityEnvironment();

function protectSensitiveFieldValue(value: unknown) {
  if (value == null) return value;
  if (typeof value === "string") {
    return protectSensitiveText(value);
  }

  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    value !== null &&
    "set" in value
  ) {
    const nextValue = value as Record<string, unknown>;
    const setValue = nextValue.set;

    if (setValue == null || typeof setValue === "string") {
      return {
        ...nextValue,
        set: protectSensitiveText(setValue as string | null | undefined),
      };
    }
  }

  return value;
}

function protectSensitiveModelFields<T>(
  input: T,
  fields: readonly string[]
): T {
  if (Array.isArray(input)) {
    return input.map((item) => protectSensitiveModelFields(item, fields)) as T;
  }

  if (!input || typeof input !== "object") {
    return input;
  }

  const clone = { ...(input as Record<string, unknown>) };

  for (const field of fields) {
    if (field in clone) {
      clone[field] = protectSensitiveFieldValue(clone[field]);
    }
  }

  return clone as T;
}

function revealSensitiveModelFields<T>(
  input: T,
  fields: readonly string[]
): T {
  if (Array.isArray(input)) {
    return input.map((item) => revealSensitiveModelFields(item, fields)) as T;
  }

  if (!input || typeof input !== "object") {
    return input;
  }

  const clone = { ...(input as Record<string, unknown>) };

  for (const field of fields) {
    if (typeof clone[field] === "string" || clone[field] == null) {
      clone[field] = revealSensitiveText(
        clone[field] as string | null | undefined
      );
    }
  }

  return clone as T;
}

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

function encryptProtectedModelArgs<T extends Record<string, unknown>>(
  args: T,
  fields: readonly string[]
): T {
  const nextArgs = { ...args } as Record<string, unknown>;

  if ("data" in nextArgs) {
    nextArgs.data = protectSensitiveModelFields(nextArgs.data, fields);
  }

  if ("create" in nextArgs) {
    nextArgs.create = protectSensitiveModelFields(nextArgs.create, fields);
  }

  if ("update" in nextArgs) {
    nextArgs.update = protectSensitiveModelFields(nextArgs.update, fields);
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
      linkedInAccount: {
        async findUnique({ args, query }) {
          return revealSensitiveModelFields(
            await query(args),
            LINKEDIN_ACCOUNT_PROTECTED_FIELDS
          );
        },
        async findUniqueOrThrow({ args, query }) {
          return revealSensitiveModelFields(
            await query(args),
            LINKEDIN_ACCOUNT_PROTECTED_FIELDS
          );
        },
        async findFirst({ args, query }) {
          return revealSensitiveModelFields(
            await query(args),
            LINKEDIN_ACCOUNT_PROTECTED_FIELDS
          );
        },
        async findFirstOrThrow({ args, query }) {
          return revealSensitiveModelFields(
            await query(args),
            LINKEDIN_ACCOUNT_PROTECTED_FIELDS
          );
        },
        async findMany({ args, query }) {
          return revealSensitiveModelFields(
            await query(args),
            LINKEDIN_ACCOUNT_PROTECTED_FIELDS
          );
        },
        async create({ args, query }) {
          return revealSensitiveModelFields(
            await query(
              encryptProtectedModelArgs(args, LINKEDIN_ACCOUNT_PROTECTED_FIELDS)
            ),
            LINKEDIN_ACCOUNT_PROTECTED_FIELDS
          );
        },
        async createMany({ args, query }) {
          return query(
            encryptProtectedModelArgs(args, LINKEDIN_ACCOUNT_PROTECTED_FIELDS)
          );
        },
        async update({ args, query }) {
          return revealSensitiveModelFields(
            await query(
              encryptProtectedModelArgs(args, LINKEDIN_ACCOUNT_PROTECTED_FIELDS)
            ),
            LINKEDIN_ACCOUNT_PROTECTED_FIELDS
          );
        },
        async updateMany({ args, query }) {
          return query(
            encryptProtectedModelArgs(args, LINKEDIN_ACCOUNT_PROTECTED_FIELDS)
          );
        },
        async upsert({ args, query }) {
          return revealSensitiveModelFields(
            await query(
              encryptProtectedModelArgs(args, LINKEDIN_ACCOUNT_PROTECTED_FIELDS)
            ),
            LINKEDIN_ACCOUNT_PROTECTED_FIELDS
          );
        },
      },
      jobHunterPack: {
        async findUnique({ args, query }) {
          return revealSensitiveModelFields(
            await query(args),
            JOB_HUNTER_PACK_PROTECTED_FIELDS
          );
        },
        async findUniqueOrThrow({ args, query }) {
          return revealSensitiveModelFields(
            await query(args),
            JOB_HUNTER_PACK_PROTECTED_FIELDS
          );
        },
        async findFirst({ args, query }) {
          return revealSensitiveModelFields(
            await query(args),
            JOB_HUNTER_PACK_PROTECTED_FIELDS
          );
        },
        async findFirstOrThrow({ args, query }) {
          return revealSensitiveModelFields(
            await query(args),
            JOB_HUNTER_PACK_PROTECTED_FIELDS
          );
        },
        async findMany({ args, query }) {
          return revealSensitiveModelFields(
            await query(args),
            JOB_HUNTER_PACK_PROTECTED_FIELDS
          );
        },
        async create({ args, query }) {
          return revealSensitiveModelFields(
            await query(
              encryptProtectedModelArgs(args, JOB_HUNTER_PACK_PROTECTED_FIELDS)
            ),
            JOB_HUNTER_PACK_PROTECTED_FIELDS
          );
        },
        async createMany({ args, query }) {
          return query(
            encryptProtectedModelArgs(args, JOB_HUNTER_PACK_PROTECTED_FIELDS)
          );
        },
        async update({ args, query }) {
          return revealSensitiveModelFields(
            await query(
              encryptProtectedModelArgs(args, JOB_HUNTER_PACK_PROTECTED_FIELDS)
            ),
            JOB_HUNTER_PACK_PROTECTED_FIELDS
          );
        },
        async updateMany({ args, query }) {
          return query(
            encryptProtectedModelArgs(args, JOB_HUNTER_PACK_PROTECTED_FIELDS)
          );
        },
        async upsert({ args, query }) {
          return revealSensitiveModelFields(
            await query(
              encryptProtectedModelArgs(args, JOB_HUNTER_PACK_PROTECTED_FIELDS)
            ),
            JOB_HUNTER_PACK_PROTECTED_FIELDS
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

// TODO(security): Resume blobs and HirePilot session transcript/report JSON are
// intentionally excluded from this generic wrapper until those flows get a
// dedicated storage / retrieval plan that will not break existing UX.
