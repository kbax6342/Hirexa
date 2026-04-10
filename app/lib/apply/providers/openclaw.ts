import { setTimeout as delay } from "node:timers/promises";

type JsonRecord = Record<string, unknown>;

export type OpenClawConfig = {
  apiUrl: string;
  apiKey?: string;
  pollIntervalMs: number;
  timeoutMs: number;
};

export type OpenClawRunSnapshot = {
  ok: boolean;
  runId?: string;
  pollUrl?: string;
  status?: string;
  message?: string;
  finalUrl?: string;
  lastUrl?: string;
  finalReason?: string;
  formDetected?: boolean;
  confirmationDetected?: boolean;
  verificationDetected?: boolean;
  hopCount?: number;
  urlsVisited?: string[];
  clicks?: Array<Record<string, unknown>>;
  debug?: JsonRecord;
  raw: unknown;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => asString(item)).filter((item): item is string => Boolean(item))
    : undefined;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`[OPENCLAW_APPLY] Missing required env var: ${name}`);
  }
  return value.trim();
}

export function getOpenClawConfig(): OpenClawConfig {
  return {
    apiUrl: requireEnv("OPENCLAW_API_URL"),
    apiKey: process.env.OPENCLAW_API_KEY?.trim() || undefined,
    pollIntervalMs: Math.max(
      1000,
      Number.parseInt(process.env.OPENCLAW_POLL_INTERVAL_MS ?? "2500", 10) || 2500,
    ),
    timeoutMs: Math.max(
      30_000,
      Number.parseInt(process.env.OPENCLAW_TIMEOUT_MS ?? "300000", 10) || 300000,
    ),
  };
}

export function hasOpenClawConfig() {
  try {
    getOpenClawConfig();
    return true;
  } catch {
    return false;
  }
}

function normalizeOpenClawSnapshot(raw: unknown): OpenClawRunSnapshot {
  const record = asRecord(raw) ?? {};
  const debug = asRecord(record.debug) ?? {};
  const trace = asRecord(record.trace) ?? debug;

  return {
    ok: record.ok !== false,
    runId: asString(record.runId) ?? asString(record.id),
    pollUrl: asString(record.pollUrl) ?? asString(record.statusUrl),
    status: asString(record.status) ?? asString(record.state),
    message: asString(record.message) ?? asString(record.error),
    finalUrl:
      asString(record.finalUrl) ??
      asString(record.url) ??
      asString(debug.finalUrl) ??
      asString(trace.finalUrl),
    lastUrl:
      asString(record.lastUrl) ??
      asString(debug.lastUrl) ??
      asString(trace.lastUrl),
    finalReason:
      asString(record.finalReason) ??
      asString(record.reason) ??
      asString(debug.finalReason),
    formDetected:
      asBoolean(record.formDetected) ??
      asBoolean(debug.formDetected) ??
      asBoolean(trace.formDetected),
    confirmationDetected:
      asBoolean(record.confirmationDetected) ??
      asBoolean(debug.confirmationDetected) ??
      asBoolean(trace.confirmationDetected),
    verificationDetected:
      asBoolean(record.verificationDetected) ??
      asBoolean(record.blockedByVerification) ??
      asBoolean(debug.verificationDetected) ??
      asBoolean(trace.verificationDetected),
    hopCount:
      asNumber(record.hopCount) ??
      asNumber(debug.hopCount) ??
      asNumber(trace.hopCount),
    urlsVisited:
      asStringArray(record.urlsVisited) ??
      asStringArray(debug.urlsVisited) ??
      asStringArray(trace.urlsVisited),
    clicks:
      (Array.isArray(record.clicks)
        ? (record.clicks as Array<Record<string, unknown>>)
        : Array.isArray(debug.clicks)
          ? (debug.clicks as Array<Record<string, unknown>>)
          : Array.isArray(trace.clicks)
            ? (trace.clicks as Array<Record<string, unknown>>)
            : undefined),
    debug: {
      ...debug,
      ...trace,
    },
    raw,
  };
}

function buildHeaders(config: OpenClawConfig) {
  return {
    "Content-Type": "application/json",
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  };
}

async function parseOpenClawResponse(response: Response) {
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const record = asRecord(payload);
    const message =
      asString(record?.error) ??
      asString(record?.message) ??
      `[OPENCLAW_APPLY] OpenClaw request failed (${response.status})`;
    throw new Error(message);
  }

  return normalizeOpenClawSnapshot(payload);
}

export async function startOpenClawRun(payload: Record<string, unknown>) {
  const config = getOpenClawConfig();

  console.log("[OPENCLAW_APPLY] starting OpenClaw run", {
    apiUrl: config.apiUrl,
    hasApiKey: Boolean(config.apiKey),
  });

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  return parseOpenClawResponse(response);
}

export function isOpenClawTerminalStatus(status: string | undefined) {
  const normalized = String(status ?? "").trim().toUpperCase();
  return (
    normalized === "SUBMITTED" ||
    normalized === "FAILED" ||
    normalized === "AUTO_APPLY_UNAVAILABLE" ||
    normalized === "COMPLETED" ||
    normalized === "DONE" ||
    normalized === "SUCCESS" ||
    normalized === "SUCCEEDED" ||
    normalized === "VERIFICATION_BLOCKED" ||
    normalized === "HUMAN_REQUIRED" ||
    normalized === "UNAVAILABLE"
  );
}

export async function waitForOpenClawRun(args: {
  initial: OpenClawRunSnapshot;
  onUpdate?: (snapshot: OpenClawRunSnapshot) => Promise<void> | void;
}) {
  const config = getOpenClawConfig();
  let snapshot = args.initial;

  await args.onUpdate?.(snapshot);

  if (isOpenClawTerminalStatus(snapshot.status) || !snapshot.runId) {
    return snapshot;
  }

  const pollUrl = snapshot.pollUrl?.trim();
  const baseUrl = config.apiUrl.replace(/\/+$/, "");
  const fallbackStatusUrl = `${baseUrl}/${encodeURIComponent(snapshot.runId)}`;
  const deadline = Date.now() + config.timeoutMs;

  while (Date.now() < deadline) {
    await delay(config.pollIntervalMs);

    const response = await fetch(pollUrl ?? fallbackStatusUrl, {
      method: "GET",
      headers: buildHeaders(config),
      cache: "no-store",
    });

    snapshot = await parseOpenClawResponse(response);
    await args.onUpdate?.(snapshot);

    if (isOpenClawTerminalStatus(snapshot.status)) {
      return snapshot;
    }
  }

  throw new Error("[OPENCLAW_APPLY] OpenClaw run timed out");
}
