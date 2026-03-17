import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/app/lib/prisma";
import {
  BILLING_PRODUCT_KEYS,
  getUserBillingWhere,
  isActiveBillingStatus,
} from "@/app/lib/billing/userBilling";

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

export const HIREPILOT_CREDIT_SOURCE = {
  MONTHLY: "monthly",
  ROLLOVER: "rollover",
  PURCHASE: "purchase",
  ADMIN_ADJUSTMENT: "admin_adjustment",
} as const;

type DbClient = {
  hirePilotCreditGrant: Pick<
    typeof prisma.hirePilotCreditGrant,
    "findMany" | "findUnique" | "findFirst" | "create" | "update"
  >;
  hirePilotCreditUsage: Pick<
    typeof prisma.hirePilotCreditUsage,
    "findMany" | "findFirst" | "create"
  >;
  userBilling: Pick<typeof prisma.userBilling, "findUnique" | "updateMany" | "upsert">;
};

const HIREPILOT_CREDITS_PRISMA_ERROR =
  "HirePilot credits Prisma delegates are unavailable. Check prisma/schema.prisma for HirePilotCreditGrant and HirePilotCreditUsage, run `npx prisma generate`, and restart the dev server.";
const HIREPILOT_CREDIT_TABLE_NAMES = [
  "public.HirePilotCreditGrant",
  "public.HirePilotCreditUsage",
] as const;
const loggedMissingTableContexts = new Set<string>();

function getCreditsDbClient(
  db: Partial<DbClient> | null | undefined,
  context: string
): DbClient {
  if (!db?.hirePilotCreditGrant || !db?.hirePilotCreditUsage || !db?.userBilling) {
    throw new Error(`[hirepilot credits] ${context}: ${HIREPILOT_CREDITS_PRISMA_ERROR}`);
  }

  return db as DbClient;
}

type CreditGrantRecord = {
  id: string;
  sourceType: string;
  totalCredits: number;
  remainingCredits: number;
  expiresAt: Date | null;
  cycleStart: Date | null;
  cycleEnd: Date | null;
  grantedAt: Date;
};

export type HirePilotCreditSummary = {
  totalAvailable: number;
  monthlyCredits: number;
  rolloverCredits: number;
  purchasedCredits: number;
  nextMonthlyResetAt: Date | null;
  earliestPurchasedExpiryAt: Date | null;
  lowBalance: boolean;
  hasExpiringCredits: boolean;
  expiringSoon: Array<{
    sourceType: string;
    remainingCredits: number;
    expiresAt: Date;
  }>;
  recentUsage: Array<{
    id: string;
    amount: number;
    sourceType: string | null;
    createdAt: Date;
  }>;
};

export const EMPTY_HIREPILOT_CREDIT_SUMMARY: HirePilotCreditSummary = {
  totalAvailable: 0,
  monthlyCredits: 0,
  rolloverCredits: 0,
  purchasedCredits: 0,
  nextMonthlyResetAt: null,
  earliestPurchasedExpiryAt: null,
  lowBalance: false,
  hasExpiringCredits: false,
  expiringSoon: [],
  recentUsage: [],
};

function isPrismaMissingHirePilotCreditTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  ) {
    const target = JSON.stringify(error.meta ?? {});
    return HIREPILOT_CREDIT_TABLE_NAMES.some(
      (tableName) => target.includes(tableName) || message.includes(tableName)
    );
  }

  return HIREPILOT_CREDIT_TABLE_NAMES.some((tableName) => message.includes(tableName));
}

function logMissingHirePilotCreditTables(context: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const key = `${context}:${message}`;
  if (loggedMissingTableContexts.has(key)) {
    return;
  }

  loggedMissingTableContexts.add(key);
  console.error(
    `[hirepilot credits] ${context}: missing HirePilot credit tables. Run \`cd my-app && npx prisma db push && npx prisma generate\`, then restart the app.`,
    {
      tables: [...HIREPILOT_CREDIT_TABLE_NAMES],
      error: message,
    }
  );
}

export type ConsumeHirePilotCreditsResult = {
  ok: boolean;
  summary: HirePilotCreditSummary;
};

function getMonthlyIncludedCredits() {
  const parsed = Number(process.env.HIREPILOT_MONTHLY_INCLUDED_CREDITS ?? "30");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 30;
}

function getMonthlyRolloverLimit() {
  const parsed = Number(process.env.HIREPILOT_MONTHLY_ROLLOVER_LIMIT ?? "10");
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 10;
}

function getPurchasedCreditsTtlDays() {
  const parsed = Number(process.env.HIREPILOT_PURCHASED_CREDIT_TTL_DAYS ?? "365");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 365;
}

function getExpiringSoonWindowDays() {
  const parsed = Number(process.env.HIREPILOT_EXPIRING_SOON_WINDOW_DAYS ?? "30");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 30;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * MILLIS_PER_DAY);
}

function isGrantUsable(grant: CreditGrantRecord, at: Date) {
  return grant.remainingCredits > 0 && (!grant.expiresAt || grant.expiresAt > at);
}

function getGrantPriority(sourceType: string) {
  switch (sourceType) {
    case HIREPILOT_CREDIT_SOURCE.MONTHLY:
      return 0;
    case HIREPILOT_CREDIT_SOURCE.ROLLOVER:
      return 1;
    case HIREPILOT_CREDIT_SOURCE.PURCHASE:
      return 2;
    case HIREPILOT_CREDIT_SOURCE.ADMIN_ADJUSTMENT:
      return 3;
    default:
      return 10;
  }
}

function sortUsableGrants(grants: CreditGrantRecord[]) {
  return [...grants].sort((left, right) => {
    const priorityDiff = getGrantPriority(left.sourceType) - getGrantPriority(right.sourceType);
    if (priorityDiff !== 0) return priorityDiff;

    const leftExpiry = left.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightExpiry = right.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;

    return left.grantedAt.getTime() - right.grantedAt.getTime();
  });
}

function buildMonthlyGrantKey(userId: string, cycleStart: Date) {
  return `monthly:${userId}:${cycleStart.toISOString()}`;
}

function buildRolloverGrantKey(userId: string, cycleStart: Date) {
  return `rollover:${userId}:${cycleStart.toISOString()}`;
}

function buildPurchaseGrantKey(
  userId: string,
  params: {
    stripeCheckoutSessionId?: string | null;
    stripeInvoiceId?: string | null;
    stripePaymentIntentId?: string | null;
    paidAt: Date;
  }
) {
  return (
    params.stripeCheckoutSessionId?.trim() ||
    params.stripeInvoiceId?.trim() ||
    params.stripePaymentIntentId?.trim() ||
    `purchase:${userId}:${params.paidAt.toISOString()}`
  );
}

async function backfillLegacyPurchasedCredits(userId: string) {
  const creditsDb = getCreditsDbClient(prisma, "backfillLegacyPurchasedCredits");
  const legacyCreditRow = await creditsDb.userBilling.findUnique({
    where: getUserBillingWhere(userId, BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT),
    select: {
      id: true,
      hirePilotCredits: true,
      lastPaymentReceivedAt: true,
      subscriptionPurchasedAt: true,
      updatedAt: true,
    },
  });

  if (!legacyCreditRow || legacyCreditRow.hirePilotCredits <= 0) {
    return;
  }

  const paidAt =
    legacyCreditRow.lastPaymentReceivedAt ??
    legacyCreditRow.subscriptionPurchasedAt ??
    legacyCreditRow.updatedAt;
  const grantKey = `legacy-credit:${userId}:${legacyCreditRow.id}`;
  const existingGrant = await creditsDb.hirePilotCreditGrant.findUnique({
    where: { grantKey },
    select: { id: true },
  });

  if (existingGrant?.id) {
    return;
  }

  await creditsDb.hirePilotCreditGrant.create({
    data: {
      userId,
      sourceType: HIREPILOT_CREDIT_SOURCE.ADMIN_ADJUSTMENT,
      totalCredits: legacyCreditRow.hirePilotCredits,
      remainingCredits: legacyCreditRow.hirePilotCredits,
      grantKey,
      grantedAt: paidAt,
      expiresAt: addDays(paidAt, getPurchasedCreditsTtlDays()),
      metadata: {
        reason: "legacy_credit_backfill",
        sourceBillingRowId: legacyCreditRow.id,
      },
    },
  });
}

async function backfillLegacyMonthlyCredits(userId: string) {
  const creditsDb = getCreditsDbClient(prisma, "backfillLegacyMonthlyCredits");
  const monthlyBilling = await creditsDb.userBilling.findUnique({
    where: getUserBillingWhere(userId, BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY),
    select: {
      id: true,
      status: true,
      hirePilotCredits: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      stripeSubscriptionId: true,
    },
  });

  if (
    !monthlyBilling ||
    !isActiveBillingStatus(monthlyBilling.status) ||
    !monthlyBilling.currentPeriodStart ||
    !monthlyBilling.currentPeriodEnd ||
    monthlyBilling.hirePilotCredits <= 0
  ) {
    return;
  }

  const grantKey = buildMonthlyGrantKey(userId, monthlyBilling.currentPeriodStart);
  const existingGrant = await creditsDb.hirePilotCreditGrant.findUnique({
    where: { grantKey },
    select: { id: true },
  });

  if (existingGrant?.id) {
    return;
  }

  await creditsDb.hirePilotCreditGrant.create({
    data: {
      userId,
      sourceType: HIREPILOT_CREDIT_SOURCE.MONTHLY,
      totalCredits: monthlyBilling.hirePilotCredits,
      remainingCredits: monthlyBilling.hirePilotCredits,
      grantKey,
      cycleStart: monthlyBilling.currentPeriodStart,
      cycleEnd: monthlyBilling.currentPeriodEnd,
      expiresAt: monthlyBilling.currentPeriodEnd,
      stripeSubscriptionId: monthlyBilling.stripeSubscriptionId ?? null,
      metadata: {
        reason: "legacy_monthly_backfill",
        sourceBillingRowId: monthlyBilling.id,
      },
    },
  });
}

async function readUsableCreditGrants(
  db: DbClient,
  userId: string,
  at: Date
) {
  const creditsDb = getCreditsDbClient(db, "readUsableCreditGrants");
  const grants = await creditsDb.hirePilotCreditGrant.findMany({
    where: {
      userId,
      remainingCredits: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: at } }],
    },
    select: {
      id: true,
      sourceType: true,
      totalCredits: true,
      remainingCredits: true,
      expiresAt: true,
      cycleStart: true,
      cycleEnd: true,
      grantedAt: true,
    },
  });

  return sortUsableGrants(grants);
}

async function summarizeCredits(db: DbClient, userId: string, at: Date) {
  const creditsDb = getCreditsDbClient(db, "summarizeCredits");
  const [grants, recentUsage, activeMonthlyBilling] = await Promise.all([
    readUsableCreditGrants(creditsDb, userId, at),
    creditsDb.hirePilotCreditUsage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        amount: true,
        sourceType: true,
        createdAt: true,
      },
    }),
    creditsDb.userBilling.findUnique({
      where: getUserBillingWhere(userId, BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY),
      select: {
        status: true,
        currentPeriodEnd: true,
      },
    }),
  ]);

  const monthlyCredits = grants
    .filter((grant) => grant.sourceType === HIREPILOT_CREDIT_SOURCE.MONTHLY)
    .reduce((total, grant) => total + grant.remainingCredits, 0);
  const rolloverCredits = grants
    .filter((grant) => grant.sourceType === HIREPILOT_CREDIT_SOURCE.ROLLOVER)
    .reduce((total, grant) => total + grant.remainingCredits, 0);
  const purchasedCredits = grants
    .filter((grant) =>
      grant.sourceType === HIREPILOT_CREDIT_SOURCE.PURCHASE ||
      grant.sourceType === HIREPILOT_CREDIT_SOURCE.ADMIN_ADJUSTMENT
    )
    .reduce((total, grant) => total + grant.remainingCredits, 0);
  const totalAvailable = monthlyCredits + rolloverCredits + purchasedCredits;
  const expiringSoonCutoff = addDays(at, getExpiringSoonWindowDays());
  const expiringSoon = grants
    .filter((grant) => grant.expiresAt && grant.expiresAt <= expiringSoonCutoff)
    .map((grant) => ({
      sourceType: grant.sourceType,
      remainingCredits: grant.remainingCredits,
      expiresAt: grant.expiresAt as Date,
    }));
  const earliestPurchasedExpiryAt =
    grants
      .filter(
        (grant) =>
          (grant.sourceType === HIREPILOT_CREDIT_SOURCE.PURCHASE ||
            grant.sourceType === HIREPILOT_CREDIT_SOURCE.ADMIN_ADJUSTMENT) &&
          grant.expiresAt
      )
      .sort((left, right) => (left.expiresAt as Date).getTime() - (right.expiresAt as Date).getTime())[0]
      ?.expiresAt ?? null;

  return {
    totalAvailable,
    monthlyCredits,
    rolloverCredits,
    purchasedCredits,
    nextMonthlyResetAt:
      isActiveBillingStatus(activeMonthlyBilling?.status) ? activeMonthlyBilling?.currentPeriodEnd ?? null : null,
    earliestPurchasedExpiryAt,
    lowBalance: totalAvailable > 0 && totalAvailable <= 3,
    hasExpiringCredits: expiringSoon.length > 0,
    expiringSoon,
    recentUsage,
  } satisfies HirePilotCreditSummary;
}

async function syncLegacyCreditCounters(db: DbClient, userId: string, at: Date) {
  const creditsDb = getCreditsDbClient(db, "syncLegacyCreditCounters");
  const summary = await summarizeCredits(db, userId, at);
  const monthlyBucket = summary.monthlyCredits + summary.rolloverCredits;

  await Promise.all([
    creditsDb.userBilling.updateMany({
      where: {
        userId,
        productKey: BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY,
      },
      data: {
        hirePilotCredits: monthlyBucket,
      },
    }),
    creditsDb.userBilling.updateMany({
      where: {
        userId,
        productKey: BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT,
      },
      data: {
        hirePilotCredits: summary.purchasedCredits,
      },
    }),
  ]);

  return summary;
}

async function maybeCreateMonthlyRolloverGrant(
  db: DbClient,
  params: {
    userId: string;
    cycleStart: Date;
    cycleEnd: Date;
  }
) {
  const creditsDb = getCreditsDbClient(db, "maybeCreateMonthlyRolloverGrant");
  const rolloverLimit = getMonthlyRolloverLimit();
  if (rolloverLimit <= 0) return null;

  const rolloverGrantKey = buildRolloverGrantKey(params.userId, params.cycleStart);
  const existing = await creditsDb.hirePilotCreditGrant.findUnique({
    where: { grantKey: rolloverGrantKey },
    select: { id: true },
  });

  if (existing?.id) return existing;

  const previousMonthlyGrant = await creditsDb.hirePilotCreditGrant.findFirst({
    where: {
      userId: params.userId,
      sourceType: HIREPILOT_CREDIT_SOURCE.MONTHLY,
      cycleEnd: {
        lt: params.cycleStart,
      },
      remainingCredits: {
        gt: 0,
      },
    },
    orderBy: {
      cycleEnd: "desc",
    },
    select: {
      id: true,
      remainingCredits: true,
    },
  });

  const rolloverAmount = Math.min(previousMonthlyGrant?.remainingCredits ?? 0, rolloverLimit);
  if (rolloverAmount <= 0) return null;

  return creditsDb.hirePilotCreditGrant.create({
    data: {
      userId: params.userId,
      sourceType: HIREPILOT_CREDIT_SOURCE.ROLLOVER,
      totalCredits: rolloverAmount,
      remainingCredits: rolloverAmount,
      grantKey: rolloverGrantKey,
      cycleStart: params.cycleStart,
      cycleEnd: params.cycleEnd,
      expiresAt: params.cycleEnd,
      metadata: {
        carriedFromMonthlyGrantId: previousMonthlyGrant?.id ?? null,
      },
    },
    select: { id: true },
  });
}

export async function grantHirePilotMonthlyCredits(params: {
  userId: string;
  cycleStart: Date;
  cycleEnd: Date;
  stripeSubscriptionId?: string | null;
  stripeInvoiceId?: string | null;
}) {
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const creditsDb = getCreditsDbClient(tx, "grantHirePilotMonthlyCredits");
      const grantKey = buildMonthlyGrantKey(params.userId, params.cycleStart);
      const existingGrant = await creditsDb.hirePilotCreditGrant.findUnique({
        where: { grantKey },
        select: { id: true },
      });

      if (existingGrant?.id) {
        await syncLegacyCreditCounters(creditsDb, params.userId, now);
        return;
      }

      await maybeCreateMonthlyRolloverGrant(creditsDb, {
        userId: params.userId,
        cycleStart: params.cycleStart,
        cycleEnd: params.cycleEnd,
      });

      const monthlyCredits = getMonthlyIncludedCredits();
      await creditsDb.hirePilotCreditGrant.create({
        data: {
          userId: params.userId,
          sourceType: HIREPILOT_CREDIT_SOURCE.MONTHLY,
          totalCredits: monthlyCredits,
          remainingCredits: monthlyCredits,
          grantKey,
          cycleStart: params.cycleStart,
          cycleEnd: params.cycleEnd,
          expiresAt: params.cycleEnd,
          stripeSubscriptionId: params.stripeSubscriptionId ?? null,
          stripeInvoiceId: params.stripeInvoiceId ?? null,
        },
      });

      await syncLegacyCreditCounters(creditsDb, params.userId, now);
    });
  } catch (error) {
    if (isPrismaMissingHirePilotCreditTableError(error)) {
      logMissingHirePilotCreditTables("grantHirePilotMonthlyCredits", error);
      return;
    }

    throw error;
  }
}

export async function grantPurchasedHirePilotCredits(params: {
  userId: string;
  credits: number;
  stripeCheckoutSessionId?: string | null;
  stripeInvoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  paidAt?: Date | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const paidAt = params.paidAt ?? new Date();
  const totalCredits = Math.max(1, Math.floor(params.credits));
  const grantKey = buildPurchaseGrantKey(params.userId, {
    stripeCheckoutSessionId: params.stripeCheckoutSessionId,
    stripeInvoiceId: params.stripeInvoiceId,
    stripePaymentIntentId: params.stripePaymentIntentId,
    paidAt,
  });

  try {
    await prisma.$transaction(async (tx) => {
      const creditsDb = getCreditsDbClient(tx, "grantPurchasedHirePilotCredits");
      const existingGrant = await creditsDb.hirePilotCreditGrant.findUnique({
        where: { grantKey },
        select: { id: true },
      });

      if (!existingGrant?.id) {
        await creditsDb.hirePilotCreditGrant.create({
          data: {
            userId: params.userId,
            sourceType: HIREPILOT_CREDIT_SOURCE.PURCHASE,
            totalCredits,
            remainingCredits: totalCredits,
            grantKey,
            grantedAt: paidAt,
            expiresAt: addDays(paidAt, getPurchasedCreditsTtlDays()),
            stripeCheckoutSessionId: params.stripeCheckoutSessionId ?? null,
            stripeInvoiceId: params.stripeInvoiceId ?? null,
            metadata: params.metadata,
          },
        });
      }

      await syncLegacyCreditCounters(creditsDb, params.userId, paidAt);
      await creditsDb.userBilling.upsert({
        where: getUserBillingWhere(params.userId, BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT),
        create: {
          userId: params.userId,
          productKey: BILLING_PRODUCT_KEYS.HIREPILOT_CREDIT,
          planType: "credits",
          status: "active",
          hirePilotCredits: totalCredits,
          subscriptionPurchasedAt: paidAt,
          lastPaymentReceivedAt: paidAt,
        },
        update: {
          status: "active",
          subscriptionPurchasedAt: paidAt,
          lastPaymentReceivedAt: paidAt,
        },
      });
    });
  } catch (error) {
    if (isPrismaMissingHirePilotCreditTableError(error)) {
      logMissingHirePilotCreditTables("grantPurchasedHirePilotCredits", error);
      return;
    }

    throw error;
  }
}

export async function ensureHirePilotCreditsForUser(userId: string) {
  try {
    await backfillLegacyPurchasedCredits(userId);
    await backfillLegacyMonthlyCredits(userId);

    const activeMonthlyBilling = await prisma.userBilling.findUnique({
      where: getUserBillingWhere(userId, BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY),
      select: {
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        stripeSubscriptionId: true,
      },
    });

    if (
      !activeMonthlyBilling ||
      !isActiveBillingStatus(activeMonthlyBilling.status) ||
      !activeMonthlyBilling.currentPeriodStart ||
      !activeMonthlyBilling.currentPeriodEnd
    ) {
      return;
    }

    await grantHirePilotMonthlyCredits({
      userId,
      cycleStart: activeMonthlyBilling.currentPeriodStart,
      cycleEnd: activeMonthlyBilling.currentPeriodEnd,
      stripeSubscriptionId: activeMonthlyBilling.stripeSubscriptionId,
    });
  } catch (error) {
    if (isPrismaMissingHirePilotCreditTableError(error)) {
      logMissingHirePilotCreditTables("ensureHirePilotCreditsForUser", error);
      return;
    }

    throw error;
  }
}

export async function getHirePilotCreditSummary(userId: string) {
  try {
    await ensureHirePilotCreditsForUser(userId);
    return await summarizeCredits(prisma, userId, new Date());
  } catch (error) {
    if (isPrismaMissingHirePilotCreditTableError(error)) {
      logMissingHirePilotCreditTables("getHirePilotCreditSummary", error);
      return EMPTY_HIREPILOT_CREDIT_SUMMARY;
    }

    throw error;
  }
}

export async function consumeHirePilotCredits(params: {
  userId: string;
  amount?: number;
  usageKey?: string | null;
  sourceType?: string | null;
  hirePilotUsageId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    await ensureHirePilotCreditsForUser(params.userId);

    const amount = Math.max(1, Math.floor(params.amount ?? 1));
    const now = new Date();

    return await prisma.$transaction(async (tx) => {
      const creditsDb = getCreditsDbClient(tx, "consumeHirePilotCredits");
      if (params.usageKey) {
        const existing = await creditsDb.hirePilotCreditUsage.findFirst({
          where: {
            userId: params.userId,
            usageKey: {
              startsWith: params.usageKey,
            },
          },
          select: { id: true },
        });

        if (existing?.id) {
          return {
            ok: true,
            summary: await syncLegacyCreditCounters(creditsDb, params.userId, now),
          } satisfies ConsumeHirePilotCreditsResult;
        }
      }

      const grants = await readUsableCreditGrants(creditsDb, params.userId, now);
      const totalAvailable = grants.reduce((total, grant) => total + grant.remainingCredits, 0);
      if (totalAvailable < amount) {
        return {
          ok: false,
          summary: await syncLegacyCreditCounters(creditsDb, params.userId, now),
        } satisfies ConsumeHirePilotCreditsResult;
      }

      let remaining = amount;
      let usageIndex = 0;

      for (const grant of grants) {
        if (remaining <= 0) break;
        if (!isGrantUsable(grant, now)) continue;

        const consumeAmount = Math.min(grant.remainingCredits, remaining);
        if (consumeAmount <= 0) continue;

        await creditsDb.hirePilotCreditGrant.update({
          where: { id: grant.id },
          data: {
            remainingCredits: {
              decrement: consumeAmount,
            },
          },
        });

        await creditsDb.hirePilotCreditUsage.create({
          data: {
            userId: params.userId,
            grantId: grant.id,
            usageKey: params.usageKey ? `${params.usageKey}:${usageIndex}` : null,
            amount: consumeAmount,
            sourceType: params.sourceType ?? "interview_session",
            hirePilotUsageId: params.hirePilotUsageId ?? null,
            metadata: params.metadata,
          },
        });

        remaining -= consumeAmount;
        usageIndex += 1;
      }

      return {
        ok: true,
        summary: await syncLegacyCreditCounters(creditsDb, params.userId, now),
      } satisfies ConsumeHirePilotCreditsResult;
    });
  } catch (error) {
    if (isPrismaMissingHirePilotCreditTableError(error)) {
      logMissingHirePilotCreditTables("consumeHirePilotCredits", error);
      return {
        ok: false,
        summary: EMPTY_HIREPILOT_CREDIT_SUMMARY,
      } satisfies ConsumeHirePilotCreditsResult;
    }

    throw error;
  }
}
