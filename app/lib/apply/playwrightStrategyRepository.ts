import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  deriveStopClassification,
  isAggregatorStopHostname,
  isApplyStopReason,
  type ApplyStopPageType,
  type ApplyStopReason,
} from "@/app/lib/apply/stopClassification";
import {
  matchPlaywrightStrategy,
  buildApplySiteStrategyKey,
  derivePlaywrightStrategyType,
  pickStrategyStartUrl,
  resolveStrategyHostname,
} from "@/app/lib/apply/playwrightStrategyMatcher";
import { sanitizePlaywrightStrategySteps } from "@/app/lib/apply/playwrightStrategySanitizer";
import {
  buildPlaywrightAutomationPrompt,
  derivePlaywrightStrategyInstruction,
} from "@/app/lib/apply/playwrightStrategyPrompt";
import type {
  ApplySiteStrategyRecord,
  ApplySiteStrategyReplayResult,
  ApplySiteStrategyReplayStatus,
  ApplySiteStrategyReplayUpdateInput,
  ApplySiteStrategySaveInput,
  ApplySiteStrategyStep,
  ApplySiteStrategyType,
} from "@/app/lib/apply/playwrightStrategyTypes";
import { deriveApplySiteStrategyStatus } from "@/app/lib/apply/playwrightStrategyTypes";

type ApplySiteStrategyRow = Awaited<
  ReturnType<typeof prisma.applySiteStrategy.findFirst>
>;

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function normalizeOptionalText(value: string | null | undefined) {
  const next = normalizeText(value);
  return next || undefined;
}

function uniqueStopReasons(
  value: Array<string | null | undefined> | undefined,
): ApplyStopReason[] {
  return Array.from(
    new Set(
      (value ?? [])
        .map((entry) => normalizeText(entry))
        .filter((entry): entry is ApplyStopReason => isApplyStopReason(entry)),
    ),
  );
}

function parseStepsJson(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry): ApplySiteStrategyStep | null => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const step = entry as Record<string, unknown>;
      const id = normalizeText(step.id as string | undefined);
      const type = normalizeText(step.type as string | undefined);
      const currentUrl = normalizeText(step.currentUrl as string | undefined);
      const timestamp = normalizeText(step.timestamp as string | undefined);

      if (!id || !type || !currentUrl || !timestamp) {
        return null;
      }

      return {
        id,
        type: type as ApplySiteStrategyStep["type"],
        selector: normalizeOptionalText(step.selector as string | undefined),
        label: normalizeOptionalText(step.label as string | undefined),
        text: normalizeOptionalText(step.text as string | undefined),
        value: normalizeOptionalText(step.value as string | undefined),
        checked:
          typeof step.checked === "boolean"
            ? step.checked
            : undefined,
        currentUrl,
        timestamp,
      } satisfies ApplySiteStrategyStep;
    })
    .filter((step): step is ApplySiteStrategyStep => Boolean(step));
}

function toJsonSteps(steps: ApplySiteStrategyStep[]) {
  return steps as unknown as Prisma.InputJsonValue;
}

function toReplayResultJson(result: ApplySiteStrategyReplayResult | null | undefined) {
  if (!result) {
    return Prisma.JsonNull;
  }

  return result as unknown as Prisma.InputJsonValue;
}

function inferPageType(args: {
  pageType?: ApplyStopPageType | string | null;
  stopReason?: string | null;
  finalUrl?: string | null;
  currentUrl?: string | null;
  sourceHost?: string | null;
}) {
  const explicit = normalizeText(args.pageType).toLowerCase();
  if (explicit) {
    return explicit as ApplyStopPageType;
  }

  return deriveStopClassification({
    finalUrl: args.finalUrl,
    currentUrl: args.currentUrl ?? args.finalUrl,
    lastAction: args.stopReason,
  }).pageType;
}

function mapStrategyRow(row: NonNullable<ApplySiteStrategyRow>): ApplySiteStrategyRecord {
  const rawSteps = parseStepsJson(row.rawStepsJson ?? row.stepsJson);
  const sanitizedSteps = parseStepsJson(row.sanitizedStepsJson ?? row.stepsJson);
  const successfulReplays = Math.max(row.successfulReplays, row.successCount);
  const failedReplays = Math.max(row.failedReplays, row.failureCount);
  const status = deriveApplySiteStrategyStatus({
    successCount: successfulReplays,
    failureCount: failedReplays,
    lastReplaySucceeded: row.lastReplaySucceeded ?? undefined,
  });

  return {
    id: row.id,
    strategyKey: row.strategyKey,
    hostname: row.hostname,
    sourceHost: row.sourceHost ?? row.hostname,
    destinationHost: row.destinationHost ?? undefined,
    strategyType: row.strategyType as ApplySiteStrategyType,
    pageType: row.pageType,
    finalUrl: row.finalUrl ?? "",
    lastAction: row.lastAction ?? "",
    stopReason: row.stopReason ?? "",
    supportedReasons: uniqueStopReasons(row.supportedReasons),
    status,
    successCount: successfulReplays,
    failureCount: failedReplays,
    successfulReplays,
    failedReplays,
    lastReplaySucceeded: row.lastReplaySucceeded ?? undefined,
    lastFailureReason: row.lastFailureReason ?? undefined,
    instructions: row.instructions ?? "",
    selectors: row.selectors ?? undefined,
    steps: sanitizedSteps,
    rawSteps,
    sanitizedSteps,
    jobTitle: row.jobTitle ?? undefined,
    company: row.company ?? undefined,
    location: row.location ?? undefined,
    derivedInstruction: row.derivedInstruction ?? undefined,
    automationPrompt: row.automationPrompt ?? undefined,
    aiSummary: row.derivedInstruction ?? undefined,
    generatedCodexPrompt: row.automationPrompt ?? undefined,
    promptGeneratedAt:
      row.automationPrompt || row.derivedInstruction
        ? row.updatedAt.toISOString()
        : undefined,
    promptGenerationSucceeded: Boolean(
      normalizeText(row.derivedInstruction) && normalizeText(row.automationPrompt),
    ),
    trainingSource:
      row.trainingSource === "playwright_recording"
        ? "playwright_recording"
        : undefined,
    lastTrainedUrl: row.lastTrainedUrl ?? undefined,
    replayStatus: (row.replayStatus as ApplySiteStrategyReplayStatus) ?? undefined,
    lastReplayedAt:
      row.lastReplayAt?.toISOString() ?? row.lastReplayedAt?.toISOString(),
    lastReplayAt:
      row.lastReplayAt?.toISOString() ?? row.lastReplayedAt?.toISOString(),
    lastReplayResult:
      (row.lastReplayResult as ApplySiteStrategyReplayResult | null) ?? undefined,
    failingStepId: row.failingStepId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listApplySiteStrategiesForUser(userProfileId: string) {
  const rows = await prisma.applySiteStrategy.findMany({
    where: { userProfileId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return rows.map(mapStrategyRow);
}

export async function saveApplySiteStrategyForUser(args: {
  userProfileId: string;
  input: ApplySiteStrategySaveInput;
}) {
  const rawSteps = args.input.steps ?? [];
  const sourceHost =
    resolveStrategyHostname(args.input.sourceHost) ||
    resolveStrategyHostname(args.input.hostname) ||
    resolveStrategyHostname(args.input.finalUrl) ||
    resolveStrategyHostname(rawSteps[0]?.currentUrl);

  if (!sourceHost) {
    throw new Error("Hostname is required.");
  }

  const sanitized = sanitizePlaywrightStrategySteps({
    steps: rawSteps,
    sourceHost,
    destinationHost: args.input.destinationHost,
    lastTrainedUrl: args.input.lastTrainedUrl,
    finalUrl: args.input.finalUrl,
  });
  const destinationHost =
    sanitized.destinationHost || resolveStrategyHostname(args.input.destinationHost);
  const stopReason = normalizeOptionalText(args.input.stopReason);
  const pageType = inferPageType({
    pageType: args.input.pageType,
    stopReason,
    finalUrl: args.input.finalUrl,
    currentUrl: args.input.lastTrainedUrl,
    sourceHost,
  });
  const strategyType =
    args.input.strategyType ??
    derivePlaywrightStrategyType({
      sourceHost,
      destinationHost,
      pageType,
      stopReason,
    });
  const derivedInstruction = derivePlaywrightStrategyInstruction({
    sourceHost,
    destinationHost,
    pageType,
    strategyType,
    stopReason,
  });
  const automationPrompt = buildPlaywrightAutomationPrompt({
    sourceHost,
    destinationHost,
    pageType,
    strategyType,
    derivedInstruction,
  });
  const strategyKey = buildApplySiteStrategyKey({
    sourceHost,
    destinationHost,
    strategyType,
    pageType,
    company: args.input.company,
    jobTitle: args.input.jobTitle,
    location: args.input.location,
  });

  const existing = await prisma.applySiteStrategy.findFirst({
    where: {
      userProfileId: args.userProfileId,
      strategyKey,
    },
  });
  const supportedReasons = uniqueStopReasons([
    ...(existing?.supportedReasons ?? []),
    ...(args.input.supportedReasons ?? []),
    stopReason,
  ]);

  const data = {
    strategyKey,
    hostname: sourceHost,
    sourceHost,
    destinationHost: destinationHost || null,
    strategyType,
    pageType,
    finalUrl: normalizeOptionalText(args.input.finalUrl) ?? null,
    lastAction: normalizeOptionalText(args.input.lastAction) ?? null,
    stopReason: stopReason ?? null,
    supportedReasons,
    instructions: normalizeOptionalText(args.input.instructions) ?? null,
    selectors: normalizeOptionalText(args.input.selectors) ?? null,
    stepsJson: toJsonSteps(sanitized.sanitizedSteps),
    rawStepsJson: toJsonSteps(sanitized.rawSteps),
    sanitizedStepsJson: toJsonSteps(sanitized.sanitizedSteps),
    jobTitle: normalizeOptionalText(args.input.jobTitle) ?? null,
    company: normalizeOptionalText(args.input.company) ?? null,
    location: normalizeOptionalText(args.input.location) ?? null,
    derivedInstruction,
    automationPrompt,
    trainingSource: args.input.trainingSource ?? null,
    lastTrainedUrl: normalizeOptionalText(args.input.lastTrainedUrl) ?? null,
  } satisfies Prisma.ApplySiteStrategyUncheckedUpdateInput;

  const saved = existing
    ? await prisma.applySiteStrategy.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.applySiteStrategy.create({
        data: {
          userProfileId: args.userProfileId,
          status: "draft",
          successCount: 0,
          failureCount: 0,
          successfulReplays: 0,
          failedReplays: 0,
          ...data,
        },
      });

  return mapStrategyRow(saved);
}

export async function recordApplySiteStrategyReplayForUser(args: {
  userProfileId: string;
  input: ApplySiteStrategyReplayUpdateInput;
}) {
  const strategy = await prisma.applySiteStrategy.findFirst({
    where: {
      userProfileId: args.userProfileId,
      ...(args.input.strategyId
        ? { id: args.input.strategyId }
        : args.input.strategyKey
          ? { strategyKey: args.input.strategyKey }
          : args.input.hostname
            ? { hostname: resolveStrategyHostname(args.input.hostname) }
            : {}),
    },
  });

  if (!strategy) {
    throw new Error("Strategy not found.");
  }

  const replayOutcome = args.input.lastReplayResult?.status;
  const successfulReplays =
    replayOutcome === "COMPLETED"
      ? strategy.successfulReplays + 1
      : strategy.successfulReplays;
  const failedReplays =
    replayOutcome === "FAILED"
      ? strategy.failedReplays + 1
      : strategy.failedReplays;
  const status = deriveApplySiteStrategyStatus({
    successCount: successfulReplays,
    failureCount: failedReplays,
    lastReplaySucceeded:
      replayOutcome === "COMPLETED"
        ? true
        : replayOutcome === "FAILED"
          ? false
          : strategy.lastReplaySucceeded ?? undefined,
  });

  const updated = await prisma.applySiteStrategy.update({
    where: { id: strategy.id },
    data: {
      replayStatus: args.input.replayStatus,
      successfulReplays,
      failedReplays,
      successCount: successfulReplays,
      failureCount: failedReplays,
      lastReplaySucceeded:
        replayOutcome === "COMPLETED"
          ? true
          : replayOutcome === "FAILED"
            ? false
            : strategy.lastReplaySucceeded,
      lastFailureReason:
        replayOutcome === "FAILED"
          ? args.input.lastReplayResult?.reason ?? strategy.lastFailureReason
          : replayOutcome === "COMPLETED"
            ? null
            : strategy.lastFailureReason,
      lastReplayResult: toReplayResultJson(args.input.lastReplayResult),
      failingStepId:
        args.input.failingStepId === undefined
          ? strategy.failingStepId
          : args.input.failingStepId,
      lastReplayAt: args.input.lastReplayedAt
        ? new Date(args.input.lastReplayedAt)
        : new Date(),
      lastReplayedAt: args.input.lastReplayedAt
        ? new Date(args.input.lastReplayedAt)
        : new Date(),
      status,
    },
  });

  return mapStrategyRow(updated);
}

export async function findBestApplySiteStrategyForRun(args: {
  userProfileId: string;
  sourceUrl?: string | null;
  targetUrl?: string | null;
  company?: string | null;
  location?: string | null;
}) {
  const strategies = await listApplySiteStrategiesForUser(args.userProfileId);
  if (strategies.length === 0) {
    return null;
  }

  const sourceHost = resolveStrategyHostname(args.sourceUrl);
  const destinationHost = resolveStrategyHostname(args.targetUrl);
  const pageType: ApplyStopPageType = isAggregatorStopHostname(sourceHost)
    ? "aggregator"
    : "employer_site";
  const strategyType = derivePlaywrightStrategyType({
    sourceHost,
    destinationHost,
    pageType,
    stopReason: pageType === "aggregator" ? "aggregator_no_cta" : null,
  });
  const match = matchPlaywrightStrategy({
    strategies,
    sourceHost,
    destinationHost,
    pageType,
    strategyType,
    company: args.company,
    location: args.location,
  });
  const strategy = match.strategy;

  if (!strategy) {
    return null;
  }

  return {
    strategy,
    startUrl: pickStrategyStartUrl(strategy),
    automationPrompt: strategy.automationPrompt ?? null,
    derivedInstruction: strategy.derivedInstruction ?? null,
    sanitizedSteps: strategy.sanitizedSteps ?? strategy.steps ?? [],
  };
}
