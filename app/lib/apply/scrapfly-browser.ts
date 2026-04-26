import type { Browser, BrowserContext, Page } from "playwright-core";

const SCRAPFLY_BROWSER_WS_URL = "wss://browser.scrapfly.io";
const DEFAULT_PROXY_POOL = "datacenter";
const DEFAULT_OS = "linux";
const DEFAULT_COUNTRY = "us";
const DEFAULT_TIMEOUT_SECONDS = "900";

let scrapflyStealthRegistered = false;
let scrapflyChromiumRuntime: PlaywrightExtraChromiumRuntime | null = null;

export type ScrapflyBrowserOptions = {
  sessionId?: string | null;
  applySessionId?: string | null;
  applicationId?: string | null;
  purpose?: "apply" | "adzuna_handoff" | "resume" | "training" | "replay";
  proxyPool?: string | null;
  os?: string | null;
  country?: string | null;
  timeoutSeconds?: number | string | null;
  autoClose?: boolean | null;
  keepAlive?: boolean;
};

export type ScrapflyConnectionOptions = {
  sessionId?: string | null;
  proxyPool?: string | null;
  os?: string | null;
  country?: string | null;
  timeoutSeconds?: number | null;
  autoClose?: boolean | null;
};

export type ScrapflyBrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  sessionId: string;
  wsEndpoint: string;
  stealthPluginRegistered: boolean;
};

type BrowserWithDisconnect = Browser & {
  disconnect?: () => Promise<void> | void;
  _connection?: {
    close?: () => void;
  };
};

type PlaywrightExtraChromiumRuntime = {
  connectOverCDP: (wsEndpoint: string) => Promise<Browser>;
  use?: (plugin: unknown) => void;
};

function resolveStealthPluginFactory(
  moduleValue: unknown,
): (() => unknown) | null {
  if (!moduleValue) return null;

  const fromDefault =
    typeof (moduleValue as { default?: unknown }).default === "function"
      ? ((moduleValue as { default: () => unknown }).default as () => unknown)
      : null;

  if (fromDefault) {
    return fromDefault;
  }

  return typeof moduleValue === "function" ? (moduleValue as () => unknown) : null;
}

async function optionalRuntimeImport(specifier: string): Promise<unknown | null> {
  try {
    return await import(/* webpackIgnore: true */ specifier);
  } catch {
    return null;
  }
}

function normalizeBooleanEnv(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function parsePositiveInteger(value: string | null | undefined) {
  const numeric = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function requireScrapflyApiKey() {
  const apiKeyPresent = Boolean(process.env.SCRAPFLY_API_KEY?.trim());
  const configuredProvider =
    process.env.REMOTE_BROWSER_PROVIDER?.trim().toLowerCase() || "local";
  console.info("[SCRAPFLY_BROWSER] config check", {
    provider: "scrapfly",
    configuredProvider,
    apiKeyPresent,
  });
  const apiKey = process.env.SCRAPFLY_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[SCRAPFLY_BROWSER] missing SCRAPFLY_API_KEY", {
      provider: "scrapfly",
      configuredProvider,
      apiKeyPresent: false,
    });
    throw new Error("Missing SCRAPFLY_API_KEY.");
  }
  return apiKey;
}

function sanitizeSessionId(value: string) {
  return value
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

export function getScrapflySessionId(args: ScrapflyBrowserOptions) {
  const base =
    args.sessionId ||
    args.applySessionId ||
    args.applicationId ||
    `manual_${Date.now()}`;

  return sanitizeSessionId(`hirexa_${args.purpose ?? "apply"}_${base}`);
}

export function buildScrapflyBrowserWsUrl(args: ScrapflyBrowserOptions) {
  const apiKey = requireScrapflyApiKey();
  const apiKeyPresent = Boolean(apiKey);
  const sessionId = getScrapflySessionId(args);
  const params = new URLSearchParams();

  params.set("api_key", apiKey);
  params.set("session", sessionId);
  const proxyPool = String(
    args.proxyPool ?? process.env.SCRAPFLY_PROXY_POOL ?? DEFAULT_PROXY_POOL,
  ).trim();
  const os = String(args.os ?? process.env.SCRAPFLY_OS ?? DEFAULT_OS).trim();
  params.set("proxy_pool", proxyPool);
  params.set("os", os);

  const country = String(
    args.country ??
      process.env.SCRAPFLY_PROXY_COUNTRY ??
      process.env.SCRAPFLY_COUNTRY ??
      DEFAULT_COUNTRY,
  ).trim();
  if (country) params.set("country", country);

  const timeoutSecondsFromMs = parsePositiveInteger(
    process.env.SCRAPFLY_SESSION_TTL_MS,
  );
  const timeoutFromMs =
    timeoutSecondsFromMs && timeoutSecondsFromMs > 0
      ? String(Math.max(1, Math.floor(timeoutSecondsFromMs / 1000)))
      : null;
  const timeoutOverride = String(args.timeoutSeconds ?? "").trim();
  const timeout =
    timeoutOverride ||
    process.env.SCRAPFLY_SESSION_TTL_SECONDS?.trim() ||
    process.env.SCRAPFLY_TIMEOUT_SECONDS?.trim() ||
    timeoutFromMs ||
    DEFAULT_TIMEOUT_SECONDS;
  if (timeout) params.set("timeout", timeout);

  const autoCloseEnv = normalizeBooleanEnv(process.env.SCRAPFLY_AUTO_CLOSE);
  const autoClose = (() => {
    if (typeof args.autoClose === "boolean") return args.autoClose;
    if (args.keepAlive) return false;
    if (typeof autoCloseEnv === "boolean") return autoCloseEnv;
    return true;
  })();
  params.set("auto_close", autoClose ? "true" : "false");

  console.info("[SCRAPFLY_BROWSER] cdp url built", {
    provider: "scrapfly",
    apiKeyPresent,
    purpose: args.purpose ?? "apply",
    autoClose,
    proxyPool,
    os,
    country,
    sessionId,
    timeoutSeconds: timeout,
  });

  return `${SCRAPFLY_BROWSER_WS_URL}?${params.toString()}`;
}

async function resolveScrapflyChromiumRuntime() {
  if (scrapflyChromiumRuntime) {
    return scrapflyChromiumRuntime;
  }

  const playwrightExtraModule = await optionalRuntimeImport("playwright-extra");
  const runtimeChromium =
    (playwrightExtraModule as { chromium?: PlaywrightExtraChromiumRuntime } | null)
      ?.chromium ?? null;
  if (!runtimeChromium || typeof runtimeChromium.connectOverCDP !== "function") {
    throw new Error("playwright-extra runtime unavailable for Scrapfly.");
  }

  scrapflyChromiumRuntime = runtimeChromium;
  return runtimeChromium;
}

async function ensureScrapflyStealthPluginRegistered(
  runtimeChromium: PlaywrightExtraChromiumRuntime,
) {
  if (scrapflyStealthRegistered) {
    return true;
  }

  if (typeof runtimeChromium.use !== "function") {
    return false;
  }

  const stealthPluginModule = await optionalRuntimeImport(
    "puppeteer-extra-plugin-stealth",
  );
  const stealthPluginFactory = resolveStealthPluginFactory(stealthPluginModule);
  if (!stealthPluginFactory) {
    return false;
  }

  runtimeChromium.use(stealthPluginFactory());
  scrapflyStealthRegistered = true;
  return true;
}

export async function connectScrapflyBrowser(args: ScrapflyBrowserOptions) {
  const sessionId = getScrapflySessionId(args);
  console.info("[SCRAPFLY_BROWSER] session id", {
    sessionId,
    purpose: args.purpose ?? "apply",
  });
  if (args.sessionId || args.applySessionId) {
    console.info("[SCRAPFLY_BROWSER] reconnecting to existing session", {
      sessionId,
      purpose: args.purpose ?? "apply",
    });
  }
  try {
    const wsUrl = buildScrapflyBrowserWsUrl(args);
    const runtimeChromium = await resolveScrapflyChromiumRuntime();

    const stealthPluginRegistered =
      await ensureScrapflyStealthPluginRegistered(runtimeChromium);
    console.info("[SCRAPFLY_BROWSER] connecting over CDP", {
      sessionId,
      purpose: args.purpose ?? "apply",
      keepAlive: args.keepAlive === true,
      stealthPluginRegistered,
    });
    const browser = await runtimeChromium.connectOverCDP(wsUrl);

    console.info("[SCRAPFLY_BROWSER] connected", {
      provider: "scrapfly",
      sessionId,
      purpose: args.purpose ?? "apply",
    });

    return {
      provider: "scrapfly" as const,
      browser,
      sessionId,
      connectUrl: wsUrl,
      stealthPluginRegistered,
    };
  } catch (error) {
    console.warn("[SCRAPFLY_BROWSER] error", {
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Backwards-compatible wrappers used by the existing apply runtime.
export function resolveScrapflySessionId(value?: string | null) {
  return getScrapflySessionId({
    applySessionId: value ?? undefined,
    purpose: "apply",
  });
}

export function createScrapflyRemoteSession(args?: {
  sessionId?: string | null;
}) {
  const sessionId = getScrapflySessionId({
    sessionId: args?.sessionId ?? undefined,
    applySessionId: args?.sessionId ?? undefined,
    purpose: "apply",
  });
  const wsEndpoint = buildScrapflyBrowserWsUrl({
    sessionId,
    applySessionId: sessionId,
    purpose: "apply",
  });

  return {
    sessionId,
    wsEndpoint,
  };
}

export async function connectScrapflyBrowserSession(
  options: ScrapflyConnectionOptions = {},
): Promise<ScrapflyBrowserSession> {
  const autoCloseEnv = normalizeBooleanEnv(process.env.SCRAPFLY_AUTO_CLOSE);
  const keepAlive =
    options.autoClose === false ||
    autoCloseEnv === false;
  const connected = await connectScrapflyBrowser({
    sessionId: options.sessionId ?? undefined,
    applySessionId: options.sessionId ?? undefined,
    purpose: "apply",
    proxyPool: options.proxyPool ?? undefined,
    os: options.os ?? undefined,
    country: options.country ?? undefined,
    timeoutSeconds: options.timeoutSeconds ?? undefined,
    autoClose: options.autoClose ?? undefined,
    keepAlive,
  });
  const browser = connected.browser;
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());

  return {
    browser,
    context,
    page,
    sessionId: connected.sessionId,
    wsEndpoint: connected.connectUrl,
    stealthPluginRegistered: connected.stealthPluginRegistered,
  };
}

export async function disconnectScrapflyBrowserSession(
  browser: Browser | null | undefined,
  options?: {
    scrapflySessionId?: string | null;
  },
) {
  const runtimeBrowser = browser as BrowserWithDisconnect | null | undefined;
  if (!runtimeBrowser) return;

  if (typeof runtimeBrowser.disconnect === "function") {
    await runtimeBrowser.disconnect();
    console.info("[SCRAPFLY_BROWSER] disconnected/preserved session", {
      mode: "disconnect",
      sessionId: options?.scrapflySessionId ?? null,
    });
    console.info("[SCRAPFLY_BROWSER] session preserved", {
      scrapflySessionId: options?.scrapflySessionId ?? null,
      mode: "disconnect",
      autoClose: false,
      sessionPreserved: true,
    });
    return;
  }

  if (typeof runtimeBrowser._connection?.close === "function") {
    runtimeBrowser._connection.close();
    console.info("[SCRAPFLY_BROWSER] disconnected/preserved session", {
      mode: "connection_close",
      sessionId: options?.scrapflySessionId ?? null,
    });
    console.info("[SCRAPFLY_BROWSER] session preserved", {
      scrapflySessionId: options?.scrapflySessionId ?? null,
      mode: "connection_close",
      autoClose: false,
      sessionPreserved: true,
    });
  }
}
