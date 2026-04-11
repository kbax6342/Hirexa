import "dotenv/config";
import express from "express";
import crypto from "node:crypto";

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.locals.matchedRoute = null;

  res.on("finish", () => {
    console.log("[AUTOMATION_WORKER] request", {
      method: req.method,
      path: req.path,
      matchedRoute: res.locals.matchedRoute ?? "UNMATCHED",
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  return next();
});

const PORT = Number(process.env.PORT || 4010);
const AUTOMATION_SERVICE_TOKEN = String(
  process.env.AUTOMATION_SERVICE_TOKEN || ""
).trim();
const OPENCLAW_GATEWAY_URL = String(
  process.env.OPENCLAW_GATEWAY_URL || ""
)
  .trim()
  .replace(/\/+$/, "");
const OPENCLAW_GATEWAY_TOKEN = String(
  process.env.OPENCLAW_GATEWAY_TOKEN || ""
).trim();

const TERMINAL_STATUSES = new Set([
  "SUBMITTED",
  "AUTO_APPLY_UNAVAILABLE",
  "FAILED",
]);

const runs = new Map();

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value, max = 600) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function safeJsonParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function getBearerToken(req) {
  const auth = req.header("authorization") || "";
  const [scheme, token] = auth.split(" ");
  if (!/^Bearer$/i.test(scheme || "")) return "";
  return String(token || "").trim();
}

function authMiddleware(req, res, next) {
  if (!AUTOMATION_SERVICE_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: "AUTOMATION_SERVICE_TOKEN is not configured.",
    });
  }

  if (getBearerToken(req) !== AUTOMATION_SERVICE_TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  return next();
}

function markMatchedRoute(route) {
  return (_req, res, next) => {
    res.locals.matchedRoute = route;
    return next();
  };
}

function normalizeStatus(value) {
  const key = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  const map = {
    QUEUED: "STARTING",
    STARTING: "STARTING",
    FINDING_APPLY: "FINDING_APPLY",
    OPENING_FORM: "OPENING_FORM",
    FILLING_FORM: "FILLING_FORM",
    SUBMITTING: "SUBMITTING",
    WAITING_CONFIRMATION: "WAITING_CONFIRMATION",
    WAITING_FOR_CONFIRMATION: "WAITING_CONFIRMATION",
    SENT: "SUBMITTED",
    SUBMITTED: "SUBMITTED",
    SUCCESS: "SUBMITTED",
    DONE: "SUBMITTED",
    COMPLETED: "SUBMITTED",
    UNAVAILABLE: "AUTO_APPLY_UNAVAILABLE",
    AUTO_APPLY_UNAVAILABLE: "AUTO_APPLY_UNAVAILABLE",
    NEEDS_VERIFICATION: "AUTO_APPLY_UNAVAILABLE",
    VERIFICATION_REQUIRED: "AUTO_APPLY_UNAVAILABLE",
    HUMAN_REQUIRED: "AUTO_APPLY_UNAVAILABLE",
    FAILED: "FAILED",
    ERROR: "FAILED",
  };

  return map[key] || "FAILED";
}

function buildDebug({
  targetUrl = "",
  finalUrl = null,
  message = "",
  status = null,
  urlsVisited = [],
  applyChain = [],
  formFound = false,
  blockedByVerification = false,
  extra = {},
} = {}) {
  const visited =
    Array.isArray(urlsVisited) && urlsVisited.length > 0
      ? urlsVisited.filter(Boolean)
      : targetUrl
        ? [targetUrl]
        : [];

  const debug = {
    engine: "openclaw",
    rawStatus: status ? String(status).trim() : null,
    targetUrl,
    finalUrl,
    hopCount: Array.isArray(applyChain) ? applyChain.length : 0,
    urlsVisited: visited,
    applyChain: Array.isArray(applyChain) ? applyChain : [],
    formFound: Boolean(formFound),
    blockedByVerification: Boolean(blockedByVerification),
    terminalReason: String(message || ""),
  };

  return { ...debug, ...extra };
}

function toRunResponse(run) {
  return {
    ok: true,
    runId: run.runId,
    status: run.status,
    terminal: run.terminal,
    success: run.success,
    message: run.message,
    finalUrl: run.finalUrl ?? null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt ?? null,
    debug: run.debug ?? null,
  };
}

function updateRun(runId, patch) {
  const current = runs.get(runId);
  if (!current) return null;

  const next = {
    ...current,
    ...patch,
    updatedAt: nowIso(),
  };

  if (patch.status) {
    next.status = normalizeStatus(patch.status);
  }

  if (typeof patch.terminal === "boolean") {
    next.terminal = patch.terminal;
  } else {
    next.terminal = TERMINAL_STATUSES.has(next.status);
  }

  if (next.terminal && !next.completedAt) {
    next.completedAt = nowIso();
  }

  if (next.debug) {
    next.debug = {
      ...current.debug,
      ...next.debug,
      rawStatus: next.debug.rawStatus ?? next.status,
      finalUrl: next.finalUrl ?? next.debug.finalUrl ?? null,
      terminalReason: next.message ?? next.debug.terminalReason ?? "",
    };
  }

  runs.set(runId, next);
  return next;
}

function createRun(body) {
  const targetUrl = String(body?.entryUrl || body?.jobUrl || "").trim();
  const createdAt = nowIso();

  const run = {
    runId: crypto.randomUUID(),
    status: "STARTING",
    terminal: false,
    success: null,
    message: "Starting auto apply...",
    finalUrl: null,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    jobUrl: String(body?.jobUrl || "").trim(),
    entryUrl: targetUrl,
    payload: body,
    debug: buildDebug({
      targetUrl,
      message: "Starting auto apply...",
      status: "STARTING",
    }),
  };

  runs.set(run.runId, run);
  return run;
}

function gatewayHeaders() {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (OPENCLAW_GATEWAY_TOKEN) {
    headers.Authorization = `Bearer ${OPENCLAW_GATEWAY_TOKEN}`;
  }

  return headers;
}

async function gatewayPostApply(run) {
  const url = new URL("apply", `${OPENCLAW_GATEWAY_URL}/`).toString();
  const response = await fetch(url, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify(run.payload),
  });
  const rawText = await response.text();
  const parsed = safeJsonParse(rawText);
  return { url, response, rawText, parsed };
}

async function gatewayGetRun(gatewayRunId) {
  const url = new URL(
    `runs/${encodeURIComponent(gatewayRunId)}`,
    `${OPENCLAW_GATEWAY_URL}/`
  ).toString();

  const response = await fetch(url, {
    method: "GET",
    headers: gatewayHeaders(),
  });

  const rawText = await response.text();
  const parsed = safeJsonParse(rawText);
  return { url, response, rawText, parsed };
}

function normalizeGatewayPayload(value, fallback = {}) {
  const record =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};

  const rawStatus = record.status ?? fallback.status ?? "FAILED";
  const status = normalizeStatus(rawStatus);
  const message =
    String(record.message ?? fallback.message ?? "Automation run updated.")
      .trim() || "Automation run updated.";

  const terminal =
    typeof record.terminal === "boolean"
      ? record.terminal
      : TERMINAL_STATUSES.has(status);

  const success =
    typeof record.success === "boolean"
      ? record.success
      : status === "SUBMITTED"
        ? true
        : terminal
          ? false
          : null;

  const finalUrl =
    typeof record.finalUrl === "string" ? record.finalUrl : fallback.finalUrl ?? null;

  const debug =
    record.debug && typeof record.debug === "object" && !Array.isArray(record.debug)
      ? record.debug
      : buildDebug({
          targetUrl: fallback.targetUrl ?? "",
          finalUrl,
          message,
          status: rawStatus,
          extra: {
            responseStatus: fallback.responseStatus,
            responseStatusText: fallback.responseStatusText,
            responseContentType: fallback.responseContentType,
            responseBodyPreview: fallback.responseBodyPreview,
            requestUrl: fallback.requestUrl,
            requestPath: fallback.requestPath,
            authHeaderSent: Boolean(OPENCLAW_GATEWAY_TOKEN),
            authHeaderName: OPENCLAW_GATEWAY_TOKEN ? "Authorization" : undefined,
            expectedJson: true,
            expectedJsonButGot: fallback.expectedJsonButGot,
          },
        });

  return {
    runId: typeof record.runId === "string" ? record.runId : null,
    status,
    terminal,
    success,
    message,
    finalUrl,
    completedAt: typeof record.completedAt === "string" ? record.completedAt : null,
    debug,
  };
}

async function processRun(runId) {
  const run = runs.get(runId);
  if (!run) return;

  const targetUrl = run.entryUrl || run.jobUrl;

  if (!OPENCLAW_GATEWAY_URL) {
    updateRun(runId, {
      status: "AUTO_APPLY_UNAVAILABLE",
      terminal: true,
      success: false,
      message: "OPENCLAW_GATEWAY_URL is not configured.",
      debug: buildDebug({
        targetUrl,
        message: "OPENCLAW_GATEWAY_URL is not configured.",
        status: "AUTO_APPLY_UNAVAILABLE",
      }),
    });
    return;
  }

  updateRun(runId, {
    status: "FINDING_APPLY",
    message: "Connecting to OpenClaw gateway...",
    debug: buildDebug({
      targetUrl,
      message: "Connecting to OpenClaw gateway...",
      status: "FINDING_APPLY",
    }),
  });

  try {
    const start = await gatewayPostApply(run);
    const contentType = start.response.headers.get("content-type") || null;

    const startFallback = {
      status: start.response.ok ? "STARTING" : "FAILED",
      message: start.response.ok
        ? "Automation run started."
        : truncate(start.rawText) || `Gateway returned HTTP ${start.response.status}.`,
      finalUrl: null,
      targetUrl,
      requestUrl: start.url,
      requestPath: "/apply",
      responseStatus: start.response.status,
      responseStatusText: start.response.statusText || null,
      responseContentType: contentType,
      responseBodyPreview: truncate(start.rawText),
      expectedJsonButGot: start.parsed ? undefined : truncate(start.rawText),
    };

    if (!start.response.ok) {
      const message =
        truncate(start.rawText) ||
        `OpenClaw gateway returned HTTP ${start.response.status}.`;

      updateRun(runId, {
        status: "FAILED",
        terminal: true,
        success: false,
        message,
        debug: buildDebug({
          targetUrl,
          message,
          status: "FAILED",
          extra: {
            requestUrl: start.url,
            requestPath: "/apply",
            responseStatus: start.response.status,
            responseStatusText: start.response.statusText || null,
            responseContentType: contentType,
            responseBodyPreview: truncate(start.rawText),
            authHeaderSent: Boolean(OPENCLAW_GATEWAY_TOKEN),
            authHeaderName: OPENCLAW_GATEWAY_TOKEN ? "Authorization" : undefined,
            expectedJson: true,
            expectedJsonButGot: start.parsed ? undefined : truncate(start.rawText),
          },
        }),
      });
      return;
    }

    const first = normalizeGatewayPayload(start.parsed, startFallback);

    updateRun(runId, {
      status: first.status,
      terminal: first.terminal,
      success: first.success,
      message: first.message,
      finalUrl: first.finalUrl ?? null,
      completedAt: first.completedAt,
      debug: first.debug,
    });

    if (!first.runId || first.terminal) {
      return;
    }

    const deadline = Date.now() + 120_000;

    while (Date.now() < deadline) {
      await sleep(1500);

      const poll = await gatewayGetRun(first.runId);
      const pollContentType = poll.response.headers.get("content-type") || null;

      if (!poll.response.ok) {
        const message =
          truncate(poll.rawText) ||
          `OpenClaw gateway returned HTTP ${poll.response.status}.`;

        updateRun(runId, {
          status: "FAILED",
          terminal: true,
          success: false,
          message,
          debug: buildDebug({
            targetUrl,
            message,
            status: "FAILED",
            extra: {
              requestUrl: poll.url,
              requestPath: `/runs/${first.runId}`,
              responseStatus: poll.response.status,
              responseStatusText: poll.response.statusText || null,
              responseContentType: pollContentType,
              responseBodyPreview: truncate(poll.rawText),
              authHeaderSent: Boolean(OPENCLAW_GATEWAY_TOKEN),
              authHeaderName: OPENCLAW_GATEWAY_TOKEN ? "Authorization" : undefined,
              expectedJson: true,
              expectedJsonButGot: poll.parsed ? undefined : truncate(poll.rawText),
            },
          }),
        });
        return;
      }

      const current = normalizeGatewayPayload(poll.parsed, {
        status: "STARTING",
        message: "Automation run updated.",
        finalUrl: null,
        targetUrl,
        requestUrl: poll.url,
        requestPath: `/runs/${first.runId}`,
        responseStatus: poll.response.status,
        responseStatusText: poll.response.statusText || null,
        responseContentType: pollContentType,
        responseBodyPreview: truncate(poll.rawText),
        expectedJsonButGot: poll.parsed ? undefined : truncate(poll.rawText),
      });

      updateRun(runId, {
        status: current.status,
        terminal: current.terminal,
        success: current.success,
        message: current.message,
        finalUrl: current.finalUrl ?? null,
        completedAt: current.completedAt,
        debug: current.debug,
      });

      if (current.terminal) {
        return;
      }
    }

    const timeoutMessage =
      "Automation worker timed out waiting for the OpenClaw gateway run to finish.";

    updateRun(runId, {
      status: "FAILED",
      terminal: true,
      success: false,
      message: timeoutMessage,
      debug: buildDebug({
        targetUrl,
        message: timeoutMessage,
        status: "FAILED",
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown automation worker error.";

    updateRun(runId, {
      status: "FAILED",
      terminal: true,
      success: false,
      message,
      debug: buildDebug({
        targetUrl,
        message,
        status: "FAILED",
      }),
    });
  }
}

app.get("/health", markMatchedRoute("GET /health"), (_req, res) => {
  res.json({
    ok: true,
    port: PORT,
    gatewayConfigured: Boolean(OPENCLAW_GATEWAY_URL),
  });
});

app.post("/apply", markMatchedRoute("POST /apply"), authMiddleware, (req, res) => {
  const run = createRun(req.body ?? {});
  res.status(202).json(toRunResponse(run));
  void processRun(run.runId);
});

app.get("/runs/:id", markMatchedRoute("GET /runs/:id"), authMiddleware, (req, res) => {
  const run = runs.get(req.params.id);

  if (!run) {
    return res.status(404).json({
      ok: false,
      error: "Automation run not found.",
    });
  }

  return res.json(toRunResponse(run));
});

app.get(
  "/apply/:id",
  markMatchedRoute("GET /apply/:id (alias)"),
  authMiddleware,
  (req, res) => {
    const run = runs.get(req.params.id);

    if (!run) {
      return res.status(404).json({
        ok: false,
        error: "Automation run not found.",
      });
    }

    return res.json(toRunResponse(run));
  }
);

app.use((req, res) => {
  res.locals.matchedRoute = "UNMATCHED";
  console.warn("[AUTOMATION_WORKER] route not found", {
    method: req.method,
    path: req.path,
  });
  return res.status(404).json({ ok: false, error: "Not Found" });
});

app.listen(PORT, () => {
  console.log("[AUTOMATION_WORKER] listening", { port: PORT });
});
