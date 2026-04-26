import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  connectScrapflyBrowser,
  disconnectScrapflyBrowserSession,
} from "@/app/lib/apply/scrapfly-browser";

export const runtime = "nodejs";

const DEV_FLAG_ENV = "ENABLE_SCRAPFLY_DEV_CHECK";
const TEST_URL = "https://web-scraping.dev/products";

function isRouteEnabled() {
  if (process.env.NODE_ENV !== "production") return true;
  return String(process.env[DEV_FLAG_ENV] ?? "").trim().toLowerCase() === "true";
}

export async function GET(req: Request) {
  if (!isRouteEnabled()) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const provider = process.env.REMOTE_BROWSER_PROVIDER?.trim().toLowerCase() || "local";
  const apiKeyPresent = Boolean(process.env.SCRAPFLY_API_KEY?.trim());
  const params = new URL(req.url).searchParams;
  const checkSessionPersistence = params.get("checkSession") === "1";
  const requestedSessionId = String(params.get("sessionId") ?? "").trim() || undefined;

  let browser: Awaited<ReturnType<typeof connectScrapflyBrowser>>["browser"] | null = null;
  let sessionId: string | null = null;

  try {
    if (provider !== "scrapfly") {
      return NextResponse.json(
        {
          ok: false,
          provider,
          apiKeyPresent,
          connected: false,
          cdpConnected: false,
          sessionId: null,
          sessionPersistenceChecked: false,
          error: "REMOTE_BROWSER_PROVIDER must be set to scrapfly.",
        },
        { status: 409 },
      );
    }

    if (!apiKeyPresent) {
      return NextResponse.json(
        {
          ok: false,
          provider: "scrapfly",
          apiKeyPresent,
          connected: false,
          cdpConnected: false,
          sessionId: null,
          sessionPersistenceChecked: false,
          error: "Missing SCRAPFLY_API_KEY.",
        },
        { status: 409 },
      );
    }

    const connected = await connectScrapflyBrowser({
      sessionId: requestedSessionId,
      applySessionId: requestedSessionId,
      purpose: "training",
      keepAlive: checkSessionPersistence,
      autoClose: checkSessionPersistence ? false : true,
    });
    browser = connected.browser;
    sessionId = connected.sessionId;

    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(TEST_URL, { waitUntil: "domcontentloaded" });
    const pageTitle = await page.title().catch(() => "");

    let sessionPersistenceChecked = false;
    let sessionPersistencePreserved: boolean | null = null;
    if (checkSessionPersistence) {
      const markerKey = "__hirexa_scrapfly_capability_check__";
      const markerValue = `ok_${Date.now()}`;
      await page
        .evaluate(
          ({ key, value }) => {
            localStorage.setItem(key, value);
          },
          { key: markerKey, value: markerValue },
        )
        .catch(() => undefined);

      await disconnectScrapflyBrowserSession(browser, {
        scrapflySessionId: sessionId,
      }).catch(() => undefined);
      browser = null;

      const reconnect = await connectScrapflyBrowser({
        sessionId,
        applySessionId: sessionId,
        purpose: "training",
        keepAlive: false,
        autoClose: true,
      });
      browser = reconnect.browser;
      const reconnectContext =
        browser.contexts()[0] ?? (await browser.newContext());
      const reconnectPage =
        reconnectContext.pages()[0] ?? (await reconnectContext.newPage());
      await reconnectPage.goto(TEST_URL, { waitUntil: "domcontentloaded" });
      sessionPersistencePreserved = await reconnectPage
        .evaluate(
          ({ key, value }) => localStorage.getItem(key) === value,
          { key: markerKey, value: markerValue },
        )
        .catch(() => false);
      sessionPersistenceChecked = true;
    }

    return NextResponse.json({
      ok: true,
      provider: "scrapfly",
      apiKeyPresent,
      connected: true,
      cdpConnected: true,
      sessionId,
      pageTitle,
      sessionPersistenceChecked,
      sessionPersistencePreserved,
      error: null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        provider: "scrapfly",
        apiKeyPresent,
        connected: false,
        cdpConnected: false,
        sessionId,
        sessionPersistenceChecked: false,
        error: error instanceof Error ? error.message : "Capability check failed.",
      },
      { status: 500 },
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
