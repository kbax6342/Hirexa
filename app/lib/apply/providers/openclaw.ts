import { setTimeout as delay } from "node:timers/promises";

type JsonRecord = Record<string, unknown>;

export type OpenClawConfig = {
  apiUrl: string;
  apiKey?: string;
  pollIntervalMs: number;
  timeoutMs: number;
};

type OpenClawTransport = {
  mode: "worker" | "gateway";
  startUrl: string;
  headers: Record<string, string>;
  fallbackStatusUrl: (runId: string) => string;
};

type OpenClawRunConfig = {
  apiUrl?: string;
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

function getAutomationWorkerBaseUrl() {
  const raw =
    process.env.AUTOMATION_WORKER_URL?.trim() ||
    process.env.AUTOMATION_SERVICE_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
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

function getOpenClawRunConfig(): OpenClawRunConfig {
  return {
    apiUrl: process.env.OPENCLAW_API_URL?.trim() || undefined,
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

function buildHeaders(config: { apiKey?: string }) {
  return {
    "Content-Type": "application/json",
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  };
}

function buildWorkerHeaders() {
  const token = process.env.AUTOMATION_SERVICE_TOKEN?.trim() || "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function resolveTransport(config: OpenClawRunConfig): OpenClawTransport {
  const workerBaseUrl = getAutomationWorkerBaseUrl();
  if (workerBaseUrl) {
    return {
      mode: "worker",
      startUrl: new URL("apply", `${workerBaseUrl}/`).toString(),
      headers: buildWorkerHeaders(),
      fallbackStatusUrl: (runId: string) =>
        new URL(`runs/${encodeURIComponent(runId)}`, `${workerBaseUrl}/`).toString(),
    };
  }

  if (!config.apiUrl) {
    throw new Error("[OPENCLAW_APPLY] Missing required env var: OPENCLAW_API_URL");
  }

  const baseUrl = config.apiUrl.replace(/\/+$/, "");
  return {
    mode: "gateway",
    startUrl: config.apiUrl,
    headers: buildHeaders(config),
    fallbackStatusUrl: (runId: string) => `${baseUrl}/${encodeURIComponent(runId)}`,
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
  const config = getOpenClawRunConfig();
  const transport = resolveTransport(config);

  console.log("[OPENCLAW_APPLY] starting OpenClaw run", {
    mode: transport.mode,
    method: "POST",
    url: transport.startUrl,
    hasAuthHeader: Boolean(transport.headers.Authorization),
  });

  const response = await fetch(transport.startUrl, {
    method: "POST",
    headers: transport.headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  console.log("[OPENCLAW_APPLY] OpenClaw start response", {
    mode: transport.mode,
    method: "POST",
    url: transport.startUrl,
    status: response.status,
  });

  const snapshot = await parseOpenClawResponse(response);

  if (!snapshot.pollUrl && snapshot.runId) {
    snapshot.pollUrl = transport.fallbackStatusUrl(snapshot.runId);
  }

  return snapshot;
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
  const config = getOpenClawRunConfig();
  const transport = resolveTransport(config);
  let snapshot = args.initial;

  await args.onUpdate?.(snapshot);

  if (isOpenClawTerminalStatus(snapshot.status) || !snapshot.runId) {
    return snapshot;
  }

  const fallbackStatusUrl = transport.fallbackStatusUrl(snapshot.runId);
  const deadline = Date.now() + config.timeoutMs;

  while (Date.now() < deadline) {
    await delay(config.pollIntervalMs);

    const requestUrl = snapshot.pollUrl?.trim() || fallbackStatusUrl;

    console.log("[OPENCLAW_APPLY] OpenClaw poll request", {
      mode: transport.mode,
      method: "GET",
      url: requestUrl,
    });

    const response = await fetch(requestUrl, {
      method: "GET",
      headers: transport.headers,
      cache: "no-store",
    });

    console.log("[OPENCLAW_APPLY] OpenClaw poll response", {
      mode: transport.mode,
      method: "GET",
      url: requestUrl,
      status: response.status,
    });

    snapshot = await parseOpenClawResponse(response);
    await args.onUpdate?.(snapshot);

    if (isOpenClawTerminalStatus(snapshot.status)) {
      return snapshot;
    }
  }

  throw new Error("[OPENCLAW_APPLY] OpenClaw run timed out");
}
