import type { RemoteSession } from "@/app/lib/apply/remoteBrowser";

const BROWSERBASE_API = "https://api.browserbase.com/v1/sessions";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[AUTO_APPLY_REMOTE] Missing required env var: ${name}`);
  }
  return value;
}

function pickConnectUrl(payload: Record<string, unknown>) {
  const candidates = [
    payload.connectUrl,
    payload.connectionUrl,
    payload.connect_url,
    payload.wsUrl,
    payload.websocketUrl,
    payload.wsEndpoint,
    payload.cdpUrl,
    payload.cdp_url,
    payload.browserWSEndpoint,
    payload.browser_ws_endpoint,
    payload.debuggerUrl,
  ];

  const found = candidates.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  if (!found || typeof found !== "string") {
    throw new Error(
      "[AUTO_APPLY_REMOTE] Browserbase response missing connect URL",
    );
  }

  return found;
}

export async function createBrowserbaseSession(): Promise<RemoteSession> {
  const apiKey = requireEnv("BROWSERBASE_API_KEY");

  const body: Record<string, unknown> = {};
  if (process.env.BROWSERBASE_PROJECT_ID) {
    body.projectId = process.env.BROWSERBASE_PROJECT_ID;
  }

  const response = await fetch(BROWSERBASE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bb-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[AUTO_APPLY_REMOTE] Failed creating Browserbase session (${response.status}): ${text}`,
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const sessionId = String(
    payload.id ?? payload.sessionId ?? payload.session_id ?? "",
  ).trim();
  if (!sessionId) {
    throw new Error("[AUTO_APPLY_REMOTE] Browserbase response missing session id");
  }

  const connectUrl = pickConnectUrl(payload);
  const viewerUrlRaw =
    payload.viewerUrl ?? payload.viewer_url ?? payload.liveUrl ?? payload.live_url;
  const viewerUrl =
    typeof viewerUrlRaw === "string" && viewerUrlRaw.trim()
      ? viewerUrlRaw
      : undefined;

  console.log("[AUTO_APPLY_REMOTE] created Browserbase session", {
    provider: "browserbase",
    sessionId,
    hasViewerUrl: Boolean(viewerUrl),
  });

  return {
    provider: "browserbase",
    sessionId,
    connectUrl,
    viewerUrl,
  };
}

export async function closeBrowserbaseSession(sessionId: string): Promise<void> {
  if (!sessionId) return;

  const apiKey = process.env.BROWSERBASE_API_KEY;
  if (!apiKey) {
    console.log(
      "[AUTO_APPLY_REMOTE] skipping Browserbase session close; missing BROWSERBASE_API_KEY",
      { sessionId },
    );
    return;
  }

  const response = await fetch(`${BROWSERBASE_API}/${sessionId}`, {
    method: "DELETE",
    headers: {
      "x-bb-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.log("[AUTO_APPLY_REMOTE] Browserbase close session failed", {
      sessionId,
      status: response.status,
      body: text,
    });
    return;
  }

  console.log("[AUTO_APPLY_REMOTE] closed Browserbase session", { sessionId });
}
