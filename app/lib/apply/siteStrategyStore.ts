"use client";

import {
  isApplyStopReason,
  type ApplyStopReason,
} from "@/app/lib/apply/stopClassification";

export const APPLY_SITE_STRATEGY_STORAGE_KEY =
  "hirexa_auto_apply_site_strategies";
export const APPLY_SITE_STRATEGY_UPDATED_EVENT =
  "hirexa:site-strategies-updated";

export type ApplySiteStrategyStep = {
  id: string;
  type: "goto" | "navigation" | "click" | "fill" | "select_option" | "toggle";
  selector?: string;
  label?: string;
  text?: string;
  value?: string;
  checked?: boolean;
  currentUrl: string;
  timestamp: string;
};

export type ApplySiteStrategyReplayStatus =
  | "IDLE"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export type ApplySiteStrategyReplayResult = {
  status: "COMPLETED" | "FAILED";
  currentUrl?: string;
  reason?: string;
  failingStepId?: string;
  completedStepCount?: number;
  totalStepCount?: number;
};

export type ApplySiteStrategyStatus =
  | "draft"
  | "tested_once"
  | "working"
  | "unstable";

export type ApplySiteStrategyRecord = {
  hostname: string;
  finalUrl: string;
  lastAction: string;
  stopReason: string;
  supportedReasons?: ApplyStopReason[];
  status: ApplySiteStrategyStatus;
  successCount: number;
  failureCount: number;
  lastReplaySucceeded?: boolean;
  lastFailureReason?: string;
  instructions: string;
  selectors?: string;
  steps?: ApplySiteStrategyStep[];
  trainingSource?: "playwright_recording";
  lastTrainedUrl?: string;
  replayStatus?: ApplySiteStrategyReplayStatus;
  lastReplayedAt?: string;
  lastReplayResult?: ApplySiteStrategyReplayResult;
  failingStepId?: string;
  createdAt: string;
  updatedAt: string;
};

type ApplySiteStrategyStore = Record<string, ApplySiteStrategyRecord>;
type ApplySiteStrategyExportEnvelope = {
  version: 1;
  exportedAt: string;
  overwriteExisting: boolean;
  strategies: ApplySiteStrategyStore;
};

const APPLY_SITE_STRATEGY_STEP_TYPES = new Set<
  ApplySiteStrategyStep["type"]
>(["goto", "navigation", "click", "fill", "select_option", "toggle"]);
const APPLY_SITE_STRATEGY_REPLAY_STATUSES = new Set<
  ApplySiteStrategyReplayStatus
>(["IDLE", "RUNNING", "COMPLETED", "FAILED"]);
const APPLY_SITE_STRATEGY_STATUSES = new Set<ApplySiteStrategyStatus>([
  "draft",
  "tested_once",
  "working",
  "unstable",
]);
const APPLY_SITE_STRATEGY_REPLAY_RESULT_STATUSES = new Set<
  NonNullable<ApplySiteStrategyReplayResult["status"]>
>(["COMPLETED", "FAILED"]);

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

function normalizeSupportedReasons(
  value: unknown,
): ApplyStopReason[] | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => Boolean(entry));

  if (normalized.some((entry) => !isApplyStopReason(entry))) {
    return null;
  }

  return Array.from(new Set(normalized)) as ApplyStopReason[];
}

function normalizeStrategyStep(step: unknown) {
  if (!isRecord(step)) return null;

  const id = readString(step.id);
  const type = readString(step.type);
  const currentUrl = readString(step.currentUrl);
  const timestamp = readString(step.timestamp);

  if (!id || !type || !currentUrl || !timestamp) {
    return null;
  }

  if (!APPLY_SITE_STRATEGY_STEP_TYPES.has(type as ApplySiteStrategyStep["type"])) {
    return null;
  }

  const checked =
    typeof step.checked === "boolean" ? step.checked : undefined;

  return {
    id,
    type: type as ApplySiteStrategyStep["type"],
    selector: readOptionalString(step.selector),
    label: readOptionalString(step.label),
    text: readOptionalString(step.text),
    value: readOptionalString(step.value),
    checked,
    currentUrl,
    timestamp,
  } satisfies ApplySiteStrategyStep;
}

function normalizeStrategyStatus(
  value: unknown,
): ApplySiteStrategyStatus | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  const status = readString(value);
  if (!status) {
    return null;
  }

  if (!APPLY_SITE_STRATEGY_STATUSES.has(status as ApplySiteStrategyStatus)) {
    return null;
  }

  return status as ApplySiteStrategyStatus;
}

function deriveStrategyStatus(args: {
  successCount: number;
  failureCount: number;
  lastReplaySucceeded?: boolean;
}) {
  if (args.lastReplaySucceeded === false && args.successCount > 0) {
    return "unstable" satisfies ApplySiteStrategyStatus;
  }

  if (args.successCount >= 2) {
    return "working" satisfies ApplySiteStrategyStatus;
  }

  if (args.successCount === 1) {
    return "tested_once" satisfies ApplySiteStrategyStatus;
  }

  if (args.failureCount > 0 && args.successCount === 0) {
    return "draft" satisfies ApplySiteStrategyStatus;
  }

  return "draft" satisfies ApplySiteStrategyStatus;
}

function normalizeReplayResult(result: unknown) {
  if (!isRecord(result)) return undefined;

  const status = readString(result.status);
  if (
    !status ||
    !APPLY_SITE_STRATEGY_REPLAY_RESULT_STATUSES.has(
      status as NonNullable<ApplySiteStrategyReplayResult["status"]>,
    )
  ) {
    return undefined;
  }

  return {
    status: status as NonNullable<ApplySiteStrategyReplayResult["status"]>,
    currentUrl: readOptionalString(result.currentUrl),
    reason: readOptionalString(result.reason),
    failingStepId: readOptionalString(result.failingStepId),
    completedStepCount: readOptionalNumber(result.completedStepCount),
    totalStepCount: readOptionalNumber(result.totalStepCount),
  } satisfies ApplySiteStrategyReplayResult;
}

function normalizeStrategyRecord(
  key: string,
  value: unknown,
): ApplySiteStrategyRecord | null {
  if (!isRecord(value)) return null;

  const resolvedKey = resolveStrategyHostname(key);
  const recordHostname = resolveStrategyHostname(
    readString(value.hostname, { trim: true }) ?? key,
  );
  const hostname = recordHostname || resolvedKey;

  if (!hostname || (resolvedKey && hostname !== resolvedKey)) {
    return null;
  }

  const finalUrl = readString(value.finalUrl);
  const lastAction = readString(value.lastAction, { trim: false });
  const stopReason = readString(value.stopReason, { trim: false });
  const instructions = readString(value.instructions, { trim: false });
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);
  const supportedReasons = normalizeSupportedReasons(value.supportedReasons);

  if (
    finalUrl === null ||
    lastAction === null ||
    stopReason === null ||
    instructions === null ||
    createdAt === null ||
    updatedAt === null ||
    supportedReasons === null
  ) {
    return null;
  }

  let steps: ApplySiteStrategyStep[] | undefined;
  if (value.steps !== undefined) {
    if (!Array.isArray(value.steps)) return null;
    const normalizedSteps = value.steps.map(normalizeStrategyStep);
    if (normalizedSteps.some((step) => step === null)) {
      return null;
    }
    steps = normalizedSteps as ApplySiteStrategyStep[];
  }

  const replayStatus = readOptionalString(value.replayStatus);
  if (
    replayStatus &&
    !APPLY_SITE_STRATEGY_REPLAY_STATUSES.has(
      replayStatus as ApplySiteStrategyReplayStatus,
    )
  ) {
    return null;
  }

  const trainingSource = readOptionalString(value.trainingSource);
  if (trainingSource && trainingSource !== "playwright_recording") {
    return null;
  }

  const replayResult = normalizeReplayResult(value.lastReplayResult);
  const explicitStatus = normalizeStrategyStatus(value.status);
  if (explicitStatus === null) {
    return null;
  }

  const lastReplaySucceeded =
    readOptionalBoolean(value.lastReplaySucceeded) ??
    (replayResult?.status === "COMPLETED"
      ? true
      : replayResult?.status === "FAILED"
        ? false
        : undefined);
  const successCount =
    readOptionalNumber(value.successCount) ??
    (lastReplaySucceeded === true ? 1 : 0);
  const failureCount =
    readOptionalNumber(value.failureCount) ??
    (lastReplaySucceeded === false ? 1 : 0);
  const lastFailureReason =
    readOptionalString(value.lastFailureReason) ??
    (lastReplaySucceeded === false ? replayResult?.reason : undefined);
  const status =
    explicitStatus ??
    deriveStrategyStatus({
      successCount,
      failureCount,
      lastReplaySucceeded,
    });

  return {
    hostname,
    finalUrl,
    lastAction,
    stopReason,
    supportedReasons,
    status,
    successCount,
    failureCount,
    lastReplaySucceeded,
    lastFailureReason,
    instructions,
    selectors: readOptionalString(value.selectors),
    steps,
    trainingSource: trainingSource as "playwright_recording" | undefined,
    lastTrainedUrl: readOptionalString(value.lastTrainedUrl),
    replayStatus: replayStatus as ApplySiteStrategyReplayStatus | undefined,
    lastReplayedAt: readOptionalString(value.lastReplayedAt),
    lastReplayResult: replayResult,
    failingStepId: readOptionalString(value.failingStepId),
    createdAt,
    updatedAt,
  } satisfies ApplySiteStrategyRecord;
}

function normalizeStrategyStore(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, record]) => [key, normalizeStrategyRecord(key, record)] as const)
      .filter((entry): entry is [string, ApplySiteStrategyRecord] => Boolean(entry[1])),
  ) as ApplySiteStrategyStore;
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
    const strategies = parsed.strategies;
    if (!isRecord(strategies)) {
      throw new Error("Import JSON must contain an object of hostname-keyed strategies.");
    }

    return {
      overwriteExisting: parsed.overwriteExisting === true,
      strategies,
    };
  }

  return {
    overwriteExisting: false,
    strategies: parsed,
  };
}

function sortStrategyStore(store: ApplySiteStrategyStore) {
  return Object.fromEntries(
    Object.entries(store).sort(([left], [right]) => left.localeCompare(right)),
  ) as ApplySiteStrategyStore;
}

function persistApplySiteStrategies(store: ApplySiteStrategyStore) {
  window.localStorage.setItem(
    APPLY_SITE_STRATEGY_STORAGE_KEY,
    JSON.stringify(sortStrategyStore(store)),
  );
  window.dispatchEvent(new CustomEvent(APPLY_SITE_STRATEGY_UPDATED_EVENT));
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function resolveStrategyHostname(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .trim()
      .toLowerCase();
  }
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
  const resolvedHostname = resolveStrategyHostname(hostname);
  if (!resolvedHostname) return null;

  return loadApplySiteStrategies()[resolvedHostname] ?? null;
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
}) {
  const strategy = getApplySiteStrategy(args.hostname);
  if (!strategy) {
    return { strategy: null, matchedByReason: false };
  }

  return {
    strategy,
    matchedByReason: strategyMatchesStopReason({
      strategy,
      reason: args.reason,
    }),
  };
}

export function saveApplySiteStrategy(args: {
  hostname: string;
  finalUrl: string;
  lastAction: string;
  stopReason: string;
  supportedReasons?: ApplyStopReason[];
  instructions: string;
  selectors?: string;
  steps?: ApplySiteStrategyStep[];
  trainingSource?: "playwright_recording";
  lastTrainedUrl?: string;
}) {
  const resolvedHostname = resolveStrategyHostname(args.hostname);
  if (!resolvedHostname) {
    throw new Error("Hostname is required.");
  }

  if (!canUseLocalStorage()) {
    throw new Error("Local storage is unavailable in this browser.");
  }

  const store = loadApplySiteStrategies();
  const existing = store[resolvedHostname];
  const now = new Date().toISOString();

  const record: ApplySiteStrategyRecord = {
    hostname: resolvedHostname,
    finalUrl: String(args.finalUrl ?? "").trim(),
    lastAction: String(args.lastAction ?? "").trim(),
    stopReason: String(args.stopReason ?? "").trim(),
    supportedReasons:
      Array.isArray(args.supportedReasons) && args.supportedReasons.length > 0
        ? Array.from(
            new Set([
              ...(existing?.supportedReasons ?? []),
              ...args.supportedReasons.filter((reason) => isApplyStopReason(reason)),
            ]),
          )
        : existing?.supportedReasons,
    status: existing?.status ?? "draft",
    successCount: existing?.successCount ?? 0,
    failureCount: existing?.failureCount ?? 0,
    lastReplaySucceeded: existing?.lastReplaySucceeded,
    lastFailureReason: existing?.lastFailureReason,
    instructions: String(args.instructions ?? "").trim(),
    selectors: String(args.selectors ?? "").trim() || undefined,
    steps: Array.isArray(args.steps)
      ? args.steps.map((step) => ({
          ...step,
          selector: step.selector?.trim() || undefined,
          label: step.label?.trim() || undefined,
          text: step.text?.trim() || undefined,
          value: step.value?.trim() || undefined,
        }))
      : existing?.steps,
    trainingSource:
      args.trainingSource ??
      (Array.isArray(args.steps) && args.steps.length > 0
        ? "playwright_recording"
        : existing?.trainingSource),
    lastTrainedUrl:
      String(args.lastTrainedUrl ?? "").trim() ||
      existing?.lastTrainedUrl ||
      undefined,
    replayStatus: existing?.replayStatus,
    lastReplayedAt: existing?.lastReplayedAt,
    lastReplayResult: existing?.lastReplayResult,
    failingStepId: existing?.failingStepId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  persistApplySiteStrategies({
    ...store,
    [resolvedHostname]: record,
  });

  return record;
}

export function updateApplySiteStrategyReplayState(args: {
  hostname: string;
  replayStatus: ApplySiteStrategyReplayStatus;
  lastReplayedAt?: string;
  lastReplayResult?: ApplySiteStrategyReplayResult | null;
  failingStepId?: string | null;
}) {
  const resolvedHostname = resolveStrategyHostname(args.hostname);
  if (!resolvedHostname) {
    throw new Error("Hostname is required.");
  }

  if (!canUseLocalStorage()) {
    throw new Error("Local storage is unavailable in this browser.");
  }

  const store = loadApplySiteStrategies();
  const existing = store[resolvedHostname];

  if (!existing) {
    throw new Error(`Strategy not found for hostname: ${resolvedHostname}`);
  }

  const replayOutcome = args.lastReplayResult?.status;
  const lastReplaySucceeded =
    replayOutcome === "COMPLETED"
      ? true
      : replayOutcome === "FAILED"
        ? false
        : existing.lastReplaySucceeded;
  const successCount =
    replayOutcome === "COMPLETED"
      ? existing.successCount + 1
      : existing.successCount;
  const failureCount =
    replayOutcome === "FAILED"
      ? existing.failureCount + 1
      : existing.failureCount;
  const nextStatus =
    replayOutcome === undefined
      ? existing.status
      : deriveStrategyStatus({
          successCount,
          failureCount,
          lastReplaySucceeded,
        });

  const record: ApplySiteStrategyRecord = {
    ...existing,
    status: nextStatus,
    successCount,
    failureCount,
    lastReplaySucceeded,
    lastFailureReason:
      replayOutcome === "FAILED"
        ? args.lastReplayResult?.reason ?? existing.lastFailureReason
        : replayOutcome === "COMPLETED"
          ? undefined
          : existing.lastFailureReason,
    replayStatus: args.replayStatus,
    lastReplayedAt: args.lastReplayedAt ?? existing.lastReplayedAt,
    lastReplayResult:
      args.lastReplayResult === undefined
        ? existing.lastReplayResult
        : args.lastReplayResult ?? undefined,
    failingStepId:
      args.failingStepId === undefined
        ? existing.failingStepId
        : args.failingStepId ?? undefined,
    updatedAt: new Date().toISOString(),
  };

  persistApplySiteStrategies({
    ...store,
    [resolvedHostname]: record,
  });

  return record;
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

export function importStrategies(json: string) {
  if (!canUseLocalStorage()) {
    throw new Error("Local storage is unavailable in this browser.");
  }

  const { overwriteExisting, strategies } = parseStrategiesImportJson(json);
  const currentStore = loadApplySiteStrategies();
  const nextStore: ApplySiteStrategyStore = { ...currentStore };
  let imported = 0;
  let skipped = 0;
  let overwritten = 0;

  for (const [key, value] of Object.entries(strategies)) {
    const normalizedRecord = normalizeStrategyRecord(key, value);
    if (!normalizedRecord) {
      skipped += 1;
      continue;
    }

    const hostname = normalizedRecord.hostname;
    const exists = Boolean(nextStore[hostname]);

    if (exists && !overwriteExisting) {
      skipped += 1;
      continue;
    }

    nextStore[hostname] = normalizedRecord;

    if (exists) {
      overwritten += 1;
    } else {
      imported += 1;
    }
  }

  if (imported > 0 || overwritten > 0) {
    persistApplySiteStrategies(nextStore);
  }

  return { imported, skipped, overwritten };
}
