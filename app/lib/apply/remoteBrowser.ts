import {
  closeBrowserbaseSession,
  createBrowserbaseSession,
} from "@/app/lib/apply/providers/browserbase";
import {
  getOpenClawConfig,
  hasOpenClawConfig,
  type OpenClawConfig,
} from "@/app/lib/apply/providers/openclaw";
import {
  buildScrapflyBrowserWsUrl,
  getScrapflySessionId,
} from "@/app/lib/apply/scrapfly-browser";

export type RemoteBrowserProvider = "browserbase" | "openclaw" | "scrapfly";

export type RemoteSession = {
  provider: RemoteBrowserProvider;
  sessionId: string;
  connectUrl: string;
  viewerUrl?: string;
};

export type RemoteBrowserRuntime = {
  provider: RemoteBrowserProvider;
  headless: true;
  isolatedProfile: true;
  serverSideOnly: true;
};

export type RemoteSessionCreateOptions = {
  applicationId?: string | null;
  applySessionId?: string | null;
  purpose?: "apply" | "adzuna_handoff" | "resume" | "training" | "replay";
  keepAlive?: boolean;
};

function getConfiguredRemoteBrowserProvider() {
  return process.env.REMOTE_BROWSER_PROVIDER?.trim().toLowerCase() ?? "";
}

function hasBrowserbaseConfig() {
  return Boolean(process.env.BROWSERBASE_API_KEY?.trim());
}

function hasScrapflyConfig() {
  return Boolean(process.env.SCRAPFLY_API_KEY?.trim());
}

export function getRemoteBrowserProvider(): RemoteBrowserProvider | null {
  const provider = getConfiguredRemoteBrowserProvider();
  const scrapflyConfigured = hasScrapflyConfig();
  const browserbaseConfigured = hasBrowserbaseConfig();
  const openclawConfigured = hasOpenClawConfig();

  console.info("[REMOTE_BROWSER] provider selected", {
    provider: provider || "local",
    browserbaseConfigured,
    openclawConfigured,
    scrapflyConfigured,
    scrapflyApiKeyPresent: scrapflyConfigured,
  });

  if (provider === "browserbase") {
    return browserbaseConfigured ? "browserbase" : null;
  }

  if (provider === "openclaw") {
    return openclawConfigured ? "openclaw" : null;
  }

  if (provider === "scrapfly") {
    console.info("[REMOTE_BROWSER] scrapfly configured", {
      provider,
      apiKeyPresent: scrapflyConfigured,
    });
    return scrapflyConfigured ? "scrapfly" : null;
  }

  return null;
}

export function requireRemoteBrowserConfig(): OpenClawConfig {
  return getOpenClawConfig();
}

export function shouldUseRemoteBrowser() {
  return getRemoteBrowserProvider() !== null;
}

export async function createRemoteSession(
  options: RemoteSessionCreateOptions = {},
): Promise<RemoteSession> {
  const provider = getRemoteBrowserProvider();
  console.info("[REMOTE_BROWSER] creating remote session", {
    provider: provider ?? "local",
    purpose: options.purpose ?? "apply",
    hasApplySessionId: Boolean(options.applySessionId),
    hasApplicationId: Boolean(options.applicationId),
  });

  try {
    if (provider === "browserbase") {
      const session = await createBrowserbaseSession();
      console.info("[REMOTE_BROWSER] remote session created", {
        provider: session.provider,
        sessionId: session.sessionId,
      });
      return session;
    }

    if (provider === "openclaw") {
      const config = getOpenClawConfig();

      const session: RemoteSession = {
        provider: "openclaw",
        sessionId: `openclaw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        connectUrl: config.apiUrl,
      };
      console.info("[REMOTE_BROWSER] remote session created", {
        provider: session.provider,
        sessionId: session.sessionId,
      });
      return session;
    }

    if (provider === "scrapfly") {
      const sessionId = getScrapflySessionId({
        sessionId: options.applySessionId ?? undefined,
        applySessionId: options.applySessionId,
        applicationId: options.applicationId,
        purpose: options.purpose ?? "apply",
        keepAlive: options.keepAlive,
      });
      const connectUrl = buildScrapflyBrowserWsUrl({
        applySessionId: options.applySessionId ?? sessionId,
        applicationId: options.applicationId,
        purpose: options.purpose ?? "apply",
        keepAlive: options.keepAlive,
      });
      console.info("[REMOTE_BROWSER] scrapfly session id selected", {
        sessionId,
      });

      console.info("[REMOTE_BROWSER] remote session created", {
        provider: "scrapfly",
        sessionId,
      });

      return {
        provider: "scrapfly",
        sessionId,
        connectUrl,
      };
    }

    throw new Error(
      "[AUTO_APPLY_REMOTE] Remote browser requested without a configured provider.",
    );
  } catch (error) {
    console.warn("[REMOTE_BROWSER] remote session failed", {
      provider: provider ?? "local",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function closeRemoteSession(
  provider?: RemoteBrowserProvider,
  sessionId?: string,
) {
  if (provider === "browserbase" && sessionId) {
    await closeBrowserbaseSession(sessionId);
  }

  return;
}

export function describeRemoteBrowserRuntime(): RemoteBrowserRuntime {
  const provider = getRemoteBrowserProvider() ?? "openclaw";

  return {
    provider,
    headless: true,
    isolatedProfile: true,
    serverSideOnly: true,
  };
}
