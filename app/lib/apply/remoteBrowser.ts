import {
  closeBrowserbaseSession,
  createBrowserbaseSession,
} from "@/app/lib/apply/providers/browserbase";
import {
  getOpenClawConfig,
  hasOpenClawConfig,
  type OpenClawConfig,
} from "@/app/lib/apply/providers/openclaw";

export type RemoteBrowserProvider = "browserbase" | "openclaw";

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

function getConfiguredRemoteBrowserProvider() {
  return process.env.REMOTE_BROWSER_PROVIDER?.trim().toLowerCase() ?? "";
}

function hasBrowserbaseConfig() {
  return Boolean(process.env.BROWSERBASE_API_KEY?.trim());
}

export function getRemoteBrowserProvider(): RemoteBrowserProvider | null {
  const provider = getConfiguredRemoteBrowserProvider();

  if (provider === "browserbase") {
    return hasBrowserbaseConfig() ? "browserbase" : null;
  }

  if (provider === "openclaw") {
    return hasOpenClawConfig() ? "openclaw" : null;
  }

  return null;
}

export function requireRemoteBrowserConfig(): OpenClawConfig {
  return getOpenClawConfig();
}

export function shouldUseRemoteBrowser() {
  return getRemoteBrowserProvider() !== null;
}

export async function createRemoteSession(): Promise<RemoteSession> {
  const provider = getRemoteBrowserProvider();

  if (provider === "browserbase") {
    return createBrowserbaseSession();
  }

  if (provider === "openclaw") {
    const config = getOpenClawConfig();

    return {
      provider: "openclaw",
      sessionId: `openclaw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      connectUrl: config.apiUrl,
    };
  }

  throw new Error(
    "[AUTO_APPLY_REMOTE] Remote browser requested without a configured provider.",
  );
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
