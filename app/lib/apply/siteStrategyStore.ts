"use client";

import {
  isApplyStopReason,
  type ApplyStopReason,
} from "@/app/lib/apply/stopClassification";
import {
  matchPlaywrightStrategy,
  resolveStrategyHostname,
} from "@/app/lib/apply/playwrightStrategyMatcher";
import {
  deriveApplySiteStrategyStatus,
  type ApplySiteStrategyExportEnvelope,
  type ApplySiteStrategyRecord,
  type ApplySiteStrategyReplayResult,
  type ApplySiteStrategyReplayStatus,
  type ApplySiteStrategyReplayUpdateInput,
  type ApplySiteStrategySaveInput,
  type ApplySiteStrategyStatus,
  type ApplySiteStrategyStep,
  type ApplySiteStrategyStore,
} from "@/app/lib/apply/playwrightStrategyTypes";

export const APPLY_SITE_STRATEGY_STORAGE_KEY =
  "hirexa_auto_apply_site_strategies";
export const APPLY_SITE_STRATEGY_UPDATED_EVENT =
  "hirexa:site-strategies-updated";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, options?: { trim?: boolean }) {
  if (typeof value !== "string") return null;
  return options?.trim === false ? value : value.trim();
}

function readOptionalString(value: unknown) {
  const next = readString(value);
  return next ? next : undefined;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeStep(step: unknown) {
  if (!isRecord(step)) return null;

  const id = readString(step.id);
  const type = readString(step.type);
  const currentUrl = readString(step.currentUrl);
  const timestamp = readString(step.timestamp);

  if (!id || !type || !currentUrl || !timestamp) {
    return null;
  }

  return {
    id,
    type: type as ApplySiteStrategyStep["type"],
    selector: readOptionalString(step.selector),
    label: readOptionalString(step.label),
    text: readOptionalString(step.text),
    value: readOptionalString(step.value),
    checked:
      typeof step.checked === "boolean" ? step.checked : undefined,
    currentUrl,
    timestamp,
  } satisfies ApplySiteStrategyStep;
}

function normalizeSteps(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;

  const normalized = value
    .map(normalizeStep)
    .filter((step): step is NonNullable<ReturnType<typeof normalizeStep>> =>
      Boolean(step),
    );

  return normalized;
}

function normalizeSupportedReasons(
  value: unknown,
): ApplyStopReason[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;

  const normalized = value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => Boolean(entry));

  if (normalized.some((entry) => !isApplyStopReason(entry))) {
    return null;
  }

  return Array.from(new Set(normalized)) as ApplyStopReason[];
}

function normalizeReplayResult(value: unknown) {
  if (!isRecord(value)) return undefined;

  const status = readString(value.status);
  if (status !== "COMPLETED" && status !== "FAILED") {
    return undefined;
  }

  return {
    status,
    currentUrl: readOptionalString(value.currentUrl),
    reason: readOptionalString(value.reason),
    failingStepId: readOptionalString(value.failingStepId),
    completedStepCount: readOptionalNumber(value.completedStepCount),
    totalStepCount: readOptionalNumber(value.totalStepCount),
  } satisfies ApplySiteStrategyReplayResult;
}

function normalizeStrategyStatus(
  value: unknown,
): ApplySiteStrategyStatus | undefined | null {
  if (value === undefined) return undefined;
  const status = readString(value);
  if (!status) return null;

  switch (status) {
    case "draft":
    case "tested_once":
    case "working":
    case "unstable":
      return status;
    default:
      return null;
  }
}

function normalizeStrategyRecord(
  key: string,
  value: unknown,
): ApplySiteStrategyRecord | null {
  if (!isRecord(value)) return null;

  const sourceHost = resolveStrategyHostname(readString(value.sourceHost) ?? "");
  const hostnameFallback = resolveStrategyHostname(readString(value.hostname) ?? "");
  const destinationHost = resolveStrategyHostname(
    readString(value.destinationHost) ?? "",
  );
  const hostname = sourceHost || hostnameFallback || destinationHost || resolveStrategyHostname(key);

  if (!hostname) {
    return null;
  }

  const supportedReasons = normalizeSupportedReasons(value.supportedReasons);
  if (supportedReasons === null) return null;

  const steps = normalizeSteps(value.steps);
  const rawSteps = normalizeSteps(value.rawSteps);
  const sanitizedSteps = normalizeSteps(value.sanitizedSteps);
  if (steps === null || rawSteps === null || sanitizedSteps === null) {
    return null;
  }

  const replayResult = normalizeReplayResult(value.lastReplayResult);
  const explicitStatus = normalizeStrategyStatus(value.status);
  if (explicitStatus === null) return null;

  const successfulReplays =
    readOptionalNumber(value.successfulReplays) ??
    readOptionalNumber(value.successCount) ??
    0;
  const failedReplays =
    readOptionalNumber(value.failedReplays) ??
    readOptionalNumber(value.failureCount) ??
    0;
  const lastReplaySucceeded =
    readOptionalBoolean(value.lastReplaySucceeded) ??
    (replayResult?.status === "COMPLETED"
      ? true
      : replayResult?.status === "FAILED"
        ? false
        : undefined);

  return {
    id: readOptionalString(value.id),
    strategyKey:
      readOptionalString(value.strategyKey) ||
      `${hostname}::legacy`,
    hostname,
    sourceHost: sourceHost || hostname,
    destinationHost: destinationHost || undefined,
    strategyType: readOptionalString(value.strategyType),
    pageType: readOptionalString(value.pageType),
    finalUrl: readString(value.finalUrl, { trim: false }) ?? "",
    lastAction: readString(value.lastAction, { trim: false }) ?? "",
    stopReason: readString(value.stopReason, { trim: false }) ?? "",
    supportedReasons,
    status:
      explicitStatus ??
      deriveApplySiteStrategyStatus({
        successCount: successfulReplays,
        failureCount: failedReplays,
        lastReplaySucceeded,
      }),
    successCount: successfulReplays,
    failureCount: failedReplays,
    successfulReplays,
    failedReplays,
    lastReplaySucceeded,
    lastFailureReason: readOptionalString(value.lastFailureReason),
    instructions: readString(value.instructions, { trim: false }) ?? "",
    selectors: readOptionalString(value.selectors),
    steps: sanitizedSteps ?? steps ?? rawSteps,
    rawSteps: rawSteps ?? steps,
    sanitizedSteps: sanitizedSteps ?? steps,
    jobTitle: readOptionalString(value.jobTitle),
    company: readOptionalString(value.company),
    location: readOptionalString(value.location),
    derivedInstruction: readOptionalString(value.derivedInstruction),
    automationPrompt: readOptionalString(value.automationPrompt),
    aiSummary:
      readOptionalString(value.aiSummary) ??
      readOptionalString(value.derivedInstruction),
    generatedCodexPrompt:
      readOptionalString(value.generatedCodexPrompt) ??
      readOptionalString(value.automationPrompt),
    promptGeneratedAt:
      readOptionalString(value.promptGeneratedAt) ??
      (readOptionalString(value.generatedCodexPrompt) ||
      readOptionalString(value.automationPrompt) ||
      readOptionalString(value.aiSummary) ||
      readOptionalString(value.derivedInstruction)
        ? readOptionalString(value.updatedAt)
        : undefined),
    promptModel: readOptionalString(value.promptModel),
    promptGenerationSucceeded:
      readOptionalBoolean(value.promptGenerationSucceeded) ??
      Boolean(
        readOptionalString(value.derivedInstruction) &&
          readOptionalString(value.automationPrompt),
      ),
    trainingSource:
      readOptionalString(value.trainingSource) === "playwright_recording"
        ? "playwright_recording"
        : undefined,
    lastTrainedUrl: readOptionalString(value.lastTrainedUrl),
    replayStatus: readOptionalString(value.replayStatus) as
      | ApplySiteStrategyReplayStatus
      | undefined,
    lastReplayedAt:
      readOptionalString(value.lastReplayedAt) ??
      readOptionalString(value.lastReplayAt),
    lastReplayAt:
      readOptionalString(value.lastReplayAt) ??
      readOptionalString(value.lastReplayedAt),
    lastReplayResult: replayResult,
    failingStepId: readOptionalString(value.failingStepId),
    createdAt: readString(value.createdAt) ?? new Date().toISOString(),
    updatedAt: readString(value.updatedAt) ?? new Date().toISOString(),
  } satisfies ApplySiteStrategyRecord;
}

function normalizeStrategyStore(value: unknown) {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, record]) => {
        const normalized = normalizeStrategyRecord(key, record);
        const nextKey = normalized?.strategyKey ?? normalized?.hostname ?? key;
        return [nextKey, normalized] as const;
      })
      .filter((entry): entry is [string, ApplySiteStrategyRecord] => Boolean(entry[1])),
  ) satisfies ApplySiteStrategyStore;
}

function sortStrategyStore(store: ApplySiteStrategyStore) {
  return Object.fromEntries(
    Object.entries(store).sort(([left], [right]) => left.localeCompare(right)),
  ) satisfies ApplySiteStrategyStore;
}

function persistApplySiteStrategies(store: ApplySiteStrategyStore) {
  if (!canUseLocalStorage()) return;

  window.localStorage.setItem(
    APPLY_SITE_STRATEGY_STORAGE_KEY,
    JSON.stringify(sortStrategyStore(store)),
  );
  window.dispatchEvent(new CustomEvent(APPLY_SITE_STRATEGY_UPDATED_EVENT));
}

function upsertStrategyRecord(record: ApplySiteStrategyRecord) {
  const current = loadApplySiteStrategies();
  const key = record.strategyKey ?? record.id ?? record.hostname;
  const next = {
    ...current,
    [key]: record,
  } satisfies ApplySiteStrategyStore;

  persistApplySiteStrategies(next);
  return record;
}

function parseStrategiesImportJson(json: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Import file is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("Import JSON must be an object.");
  }

  if ("strategies" in parsed) {
    if (!isRecord(parsed.strategies)) {
      throw new Error("Import JSON must contain an object of saved strategies.");
    }

    return {
      overwriteExisting: parsed.overwriteExisting === true,
      strategies: parsed.strategies,
    };
  }

  return {
    overwriteExisting: false,
    strategies: parsed,
  };
}

export function loadApplySiteStrategies(): ApplySiteStrategyStore {
  if (!canUseLocalStorage()) return {};

  try {
    const raw = window.localStorage.getItem(APPLY_SITE_STRATEGY_STORAGE_KEY);
    if (!raw) return {};

    return normalizeStrategyStore(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function getApplySiteStrategy(hostname: string | null | undefined) {
  return getApplySiteStrategyMatch({ hostname }).strategy;
}

function listStrategies() {
  return Object.values(loadApplySiteStrategies());
}

async function readJsonResponse(response: Response) {
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "Unable to load saved strategies.",
    );
  }

  return payload;
}

export async function refreshApplySiteStrategies() {
  if (typeof window === "undefined") return {};

  const response = await fetch("/api/apply/strategies", {
    cache: "no-store",
  });
  const payload = await readJsonResponse(response);
  const nextStrategies = Array.isArray(payload.strategies)
    ? payload.strategies
        .map((entry, index) => normalizeStrategyRecord(String(index), entry))
        .filter((entry): entry is ApplySiteStrategyRecord => Boolean(entry))
    : [];
  const mergedStore = { ...loadApplySiteStrategies() };

  for (const strategy of nextStrategies) {
    const key = strategy.strategyKey ?? strategy.id ?? strategy.hostname;
    mergedStore[key] = strategy;
  }

  persistApplySiteStrategies(mergedStore);
  return mergedStore;
}

function toRequestPayload(input: ApplySiteStrategySaveInput) {
  return {
    ...input,
    hostname: resolveStrategyHostname(input.hostname ?? input.sourceHost),
  };
}

export async function saveApplySiteStrategy(input: ApplySiteStrategySaveInput) {
  const response = await fetch("/api/apply/strategies", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toRequestPayload(input)),
  });
  const payload = await readJsonResponse(response);
  const strategyPayload = payload.strategy as Record<string, unknown> | undefined;
  const enrichedStrategyPayload = {
    ...(strategyPayload ?? {}),
    aiSummary: payload.aiSummary ?? strategyPayload?.aiSummary,
    generatedCodexPrompt:
      payload.generatedCodexPrompt ?? strategyPayload?.generatedCodexPrompt,
    promptGeneratedAt:
      payload.promptGeneratedAt ?? strategyPayload?.promptGeneratedAt,
    promptModel: payload.promptModel ?? strategyPayload?.promptModel,
  };
  const strategy = normalizeStrategyRecord(
    readString(payload.strategyKey) ?? readString(strategyPayload?.strategyKey) ?? "",
    enrichedStrategyPayload,
  );

  if (!strategy) {
    throw new Error("Strategy save returned an invalid record.");
  }

  return upsertStrategyRecord(strategy);
}

export async function updateApplySiteStrategyReplayState(
  input: ApplySiteStrategyReplayUpdateInput,
) {
  const response = await fetch("/api/apply/strategies", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...input,
      hostname: resolveStrategyHostname(input.hostname),
    }),
  });
  const payload = await readJsonResponse(response);
  const strategy = normalizeStrategyRecord(
    readString((payload.strategy as Record<string, unknown> | undefined)?.strategyKey) ?? "",
    payload.strategy,
  );

  if (!strategy) {
    throw new Error("Strategy update returned an invalid record.");
  }

  return upsertStrategyRecord(strategy);
}

function getLegacySupportedReasons(
  strategy: Pick<ApplySiteStrategyRecord, "lastAction">,
): ApplyStopReason[] {
  return isApplyStopReason(strategy.lastAction) ? [strategy.lastAction] : [];
}

export function strategyMatchesStopReason(args: {
  strategy: ApplySiteStrategyRecord;
  reason?: string | null;
}) {
  const reason = readString(args.reason);
  if (!reason || !isApplyStopReason(reason)) {
    return false;
  }

  const supportedReasons = [
    ...(args.strategy.supportedReasons ?? []),
    ...getLegacySupportedReasons(args.strategy),
  ];

  return supportedReasons.includes(reason);
}

export function getApplySiteStrategyMatch(args: {
  hostname: string | null | undefined;
  reason?: string | null;
  destinationHost?: string | null;
  pageType?: string | null;
  strategyType?: string | null;
  company?: string | null;
  location?: string | null;
}) {
  const strategies = listStrategies();
  const match = matchPlaywrightStrategy({
    strategies,
    sourceHost: resolveStrategyHostname(args.hostname),
    destinationHost: resolveStrategyHostname(args.destinationHost),
    pageType: args.pageType,
    strategyType: args.strategyType,
    company: args.company,
    location: args.location,
  });

  return {
    strategy: match.strategy,
    matchedByReason: match.strategy
      ? strategyMatchesStopReason({
          strategy: match.strategy,
          reason: args.reason,
        })
      : false,
  };
}

export function getApplySiteStrategyStatusLabel(status: ApplySiteStrategyStatus) {
  switch (status) {
    case "tested_once":
      return "Tested once";
    case "working":
      return "Working";
    case "unstable":
      return "Unstable";
    case "draft":
    default:
      return "Draft";
  }
}

export function exportStrategies() {
  const envelope: ApplySiteStrategyExportEnvelope = {
    version: 1,
    exportedAt: new Date().toISOString(),
    overwriteExisting: false,
    strategies: sortStrategyStore(loadApplySiteStrategies()),
  };

  return JSON.stringify(envelope, null, 2);
}

export async function importStrategies(json: string) {
  const { overwriteExisting, strategies } = parseStrategiesImportJson(json);
  const currentStore = loadApplySiteStrategies();
  let imported = 0;
  let skipped = 0;
  let overwritten = 0;

  for (const [key, value] of Object.entries(strategies)) {
    const normalized = normalizeStrategyRecord(key, value);
    if (!normalized) {
      skipped += 1;
      continue;
    }

    const existingKey = normalized.strategyKey ?? normalized.hostname;
    const exists = Boolean(currentStore[existingKey]);
    if (exists && !overwriteExisting) {
      skipped += 1;
      continue;
    }

    await saveApplySiteStrategy({
      hostname: normalized.hostname,
      sourceHost: normalized.sourceHost,
      destinationHost: normalized.destinationHost,
      finalUrl: normalized.finalUrl,
      lastAction: normalized.lastAction,
      stopReason: normalized.stopReason,
      supportedReasons: normalized.supportedReasons,
      instructions: normalized.instructions,
      selectors: normalized.selectors,
      steps: normalized.rawSteps ?? normalized.steps,
      trainingSource: normalized.trainingSource,
      lastTrainedUrl: normalized.lastTrainedUrl,
      jobTitle: normalized.jobTitle,
      company: normalized.company,
      location: normalized.location,
      pageType: normalized.pageType as ApplySiteStrategySaveInput["pageType"],
      strategyType:
        normalized.strategyType as ApplySiteStrategySaveInput["strategyType"],
    });

    if (exists) {
      overwritten += 1;
    } else {
      imported += 1;
    }
  }

  return { imported, skipped, overwritten };
}

export type {
  ApplySiteStrategyRecord,
  ApplySiteStrategyReplayResult,
  ApplySiteStrategyReplayStatus,
  ApplySiteStrategyStep,
};

export { resolveStrategyHostname };
