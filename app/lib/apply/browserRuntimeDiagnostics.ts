import type { Page } from "playwright-core";

export type BrowserRuntimeDiagnostics = {
  hasChromeObject: boolean;
  hasChromeApp: boolean;
  hasChromeCsi: boolean;
  hasChromeLoadTimes: boolean;
  hasChromeRuntime: boolean;
  navigatorWebdriverValue: boolean | null;
  navigatorPluginsLength: number | null;
  navigatorLanguages: string[];
  navigatorPermissionsQueryType: string;
  navigatorVendor: string | null;
  navigatorPlatform: string | null;
  navigatorHardwareConcurrency: number | null;
  userAgent: string | null;
  viewport: {
    width: number | null;
    height: number | null;
    deviceScaleFactor: number | null;
  };
  timezone: string | null;
  locale: string | null;
};

function toNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function readBrowserRuntimeDiagnostics(
  page: Page,
): Promise<BrowserRuntimeDiagnostics> {
  const snapshot = await page.evaluate(async () => {
    const win = window as Window & {
      chrome?: {
        app?: unknown;
        csi?: unknown;
        loadTimes?: unknown;
        runtime?: unknown;
      };
    };
    const nav = navigator as Navigator & {
      webdriver?: boolean;
      permissions?: {
        query?: unknown;
      };
    };

    const resolvedTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    const resolvedLocale = Intl.DateTimeFormat().resolvedOptions().locale ?? null;

    return {
      hasChromeObject: Boolean(win.chrome),
      hasChromeApp: Boolean(win.chrome?.app),
      hasChromeCsi: Boolean(win.chrome?.csi),
      hasChromeLoadTimes: Boolean(win.chrome?.loadTimes),
      hasChromeRuntime: Boolean(win.chrome?.runtime),
      navigatorWebdriverValue:
        typeof nav.webdriver === "boolean" ? nav.webdriver : null,
      navigatorPluginsLength:
        typeof nav.plugins?.length === "number" ? nav.plugins.length : null,
      navigatorLanguages: Array.isArray(nav.languages)
        ? nav.languages.filter((value): value is string => typeof value === "string")
        : [],
      navigatorPermissionsQueryType: typeof nav.permissions?.query,
      navigatorVendor:
        typeof nav.vendor === "string" ? nav.vendor : null,
      navigatorPlatform:
        typeof nav.platform === "string" ? nav.platform : null,
      navigatorHardwareConcurrency:
        typeof nav.hardwareConcurrency === "number"
          ? nav.hardwareConcurrency
          : null,
      userAgent:
        typeof nav.userAgent === "string" ? nav.userAgent : null,
      deviceScaleFactor:
        typeof window.devicePixelRatio === "number"
          ? window.devicePixelRatio
          : null,
      timezone: resolvedTimeZone,
      locale: resolvedLocale,
    };
  });

  const viewport = page.viewportSize();

  return {
    hasChromeObject: snapshot.hasChromeObject === true,
    hasChromeApp: snapshot.hasChromeApp === true,
    hasChromeCsi: snapshot.hasChromeCsi === true,
    hasChromeLoadTimes: snapshot.hasChromeLoadTimes === true,
    hasChromeRuntime: snapshot.hasChromeRuntime === true,
    navigatorWebdriverValue:
      typeof snapshot.navigatorWebdriverValue === "boolean"
        ? snapshot.navigatorWebdriverValue
        : null,
    navigatorPluginsLength:
      typeof snapshot.navigatorPluginsLength === "number"
        ? snapshot.navigatorPluginsLength
        : null,
    navigatorLanguages: Array.isArray(snapshot.navigatorLanguages)
      ? snapshot.navigatorLanguages.filter((value): value is string => typeof value === "string")
      : [],
    navigatorPermissionsQueryType:
      typeof snapshot.navigatorPermissionsQueryType === "string"
        ? snapshot.navigatorPermissionsQueryType
        : "undefined",
    navigatorVendor: toNullableString(snapshot.navigatorVendor),
    navigatorPlatform: toNullableString(snapshot.navigatorPlatform),
    navigatorHardwareConcurrency:
      typeof snapshot.navigatorHardwareConcurrency === "number"
        ? snapshot.navigatorHardwareConcurrency
        : null,
    userAgent: toNullableString(snapshot.userAgent),
    viewport: {
      width: viewport?.width ?? null,
      height: viewport?.height ?? null,
      deviceScaleFactor:
        typeof snapshot.deviceScaleFactor === "number"
          ? snapshot.deviceScaleFactor
          : null,
    },
    timezone: toNullableString(snapshot.timezone),
    locale: toNullableString(snapshot.locale),
  };
}
