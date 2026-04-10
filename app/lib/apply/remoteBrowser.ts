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

export function getRemoteBrowserProvider(): RemoteBrowserProvider | null {
  return hasOpenClawConfig() ? "openclaw" : null;
}

export function requireRemoteBrowserConfig(): OpenClawConfig {
  return getOpenClawConfig();
}

export function shouldUseRemoteBrowser() {
  return hasOpenClawConfig();
}

export async function createRemoteSession(): Promise<RemoteSession> {
  const config = getOpenClawConfig();

  return {
    provider: "openclaw",
    sessionId: `openclaw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    connectUrl: config.apiUrl,
  };
}

export async function closeRemoteSession(
  _provider?: RemoteBrowserProvider,
  _sessionId?: string,
) {
  void _provider;
  void _sessionId;
  return;
}

export function describeRemoteBrowserRuntime(): RemoteBrowserRuntime {
  return {
    provider: "openclaw",
    headless: true,
    isolatedProfile: true,
    serverSideOnly: true,
  };
}
