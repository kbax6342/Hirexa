import type {
  Browser,
  BrowserContext,
  Page,
} from "playwright-core";
import { chromium as playwrightExtraChromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

const SCRAPFLY_BROWSER_WS_URL = "wss://browser.scrapfly.io";
const DEFAULT_PROXY_POOL = "datacenter";
const DEFAULT_OS = "windows";
const DEFAULT_COUNTRY = "us";
const DEFAULT_TIMEOUT_SECONDS = 1_800;
const DEFAULT_AUTO_CLOSE = false;

let scrapflyStealthRegistered = false;

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

function requireScrapflyApiKey() {
  const apiKey = process.env.SCRAPFLY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "[AUTO_APPLY_SCRAPFLY] Missing required env var: SCRAPFLY_API_KEY",
    );
  }
  return apiKey;
}

function sanitizeSessionId(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return cleaned || null;
}

export function resolveScrapflySessionId(value?: string | null) {
  return (
    sanitizeSessionId(value) ??
    `scrapfly_apply_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  );
}

function resolveScrapflyFlag(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function resolveTimeoutSeconds(value: number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.floor(value));
  }
  return DEFAULT_TIMEOUT_SECONDS;
}

function resolveOptional(value: string | null | undefined, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

export function ensureScrapflyStealthPluginRegistered() {
  if (scrapflyStealthRegistered) {
    return true;
  }

  if (typeof playwrightExtraChromium.use !== "function") {
    return false;
  }

  playwrightExtraChromium.use(StealthPlugin());
  scrapflyStealthRegistered = true;
  return true;
}

export function buildScrapflyWsEndpoint(args: {
  apiKey: string;
  sessionId: string;
  proxyPool?: string | null;
  os?: string | null;
  country?: string | null;
  timeoutSeconds?: number | null;
  autoClose?: boolean | null;
}) {
  const url = new URL(SCRAPFLY_BROWSER_WS_URL);
  url.searchParams.set("key", args.apiKey);
  url.searchParams.set(
    "proxy_pool",
    resolveOptional(args.proxyPool, DEFAULT_PROXY_POOL),
  );
  url.searchParams.set("os", resolveOptional(args.os, DEFAULT_OS));
  url.searchParams.set(
    "country",
    resolveOptional(args.country, DEFAULT_COUNTRY),
  );
  url.searchParams.set("session", args.sessionId);
  url.searchParams.set(
    "auto_close",
    String(Boolean(args.autoClose ?? DEFAULT_AUTO_CLOSE)),
  );
  url.searchParams.set(
    "timeout",
    String(resolveTimeoutSeconds(args.timeoutSeconds)),
  );
  return url.toString();
}

export function createScrapflyRemoteSession(args?: {
  sessionId?: string | null;
}) {
  const apiKey = requireScrapflyApiKey();
  const sessionId = resolveScrapflySessionId(args?.sessionId);

  const wsEndpoint = buildScrapflyWsEndpoint({
    apiKey,
    sessionId,
    proxyPool: process.env.SCRAPFLY_PROXY_POOL,
    os: process.env.SCRAPFLY_OS,
    country: process.env.SCRAPFLY_COUNTRY,
    timeoutSeconds: Number.parseInt(
      process.env.SCRAPFLY_TIMEOUT_SECONDS ?? "",
      10,
    ),
    autoClose:
      resolveScrapflyFlag(process.env.SCRAPFLY_AUTO_CLOSE) ??
      DEFAULT_AUTO_CLOSE,
  });

  return {
    sessionId,
    wsEndpoint,
  };
}

export async function connectScrapflyBrowserSession(
  options: ScrapflyConnectionOptions = {},
): Promise<ScrapflyBrowserSession> {
  const apiKey = requireScrapflyApiKey();
  const sessionId = resolveScrapflySessionId(options.sessionId);
  const wsEndpoint = buildScrapflyWsEndpoint({
    apiKey,
    sessionId,
    proxyPool: options.proxyPool ?? process.env.SCRAPFLY_PROXY_POOL,
    os: options.os ?? process.env.SCRAPFLY_OS,
    country: options.country ?? process.env.SCRAPFLY_COUNTRY,
    timeoutSeconds:
      options.timeoutSeconds ??
      Number.parseInt(process.env.SCRAPFLY_TIMEOUT_SECONDS ?? "", 10),
    autoClose:
      options.autoClose ??
      resolveScrapflyFlag(process.env.SCRAPFLY_AUTO_CLOSE) ??
      DEFAULT_AUTO_CLOSE,
  });

  const stealthPluginRegistered = ensureScrapflyStealthPluginRegistered();
  const browser = await playwrightExtraChromium.connectOverCDP(wsEndpoint);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());

  return {
    browser,
    context,
    page,
    sessionId,
    wsEndpoint,
    stealthPluginRegistered,
  };
}

export async function disconnectScrapflyBrowserSession(
  browser: Browser | null | undefined,
) {
  const runtimeBrowser = browser as BrowserWithDisconnect | null | undefined;
  if (!runtimeBrowser) return;

  if (typeof runtimeBrowser.disconnect === "function") {
    await runtimeBrowser.disconnect();
    return;
  }

  if (typeof runtimeBrowser._connection?.close === "function") {
    runtimeBrowser._connection.close();
  }
}
