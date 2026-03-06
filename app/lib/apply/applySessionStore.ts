import type { BrowserContext, Page } from "playwright-core";

export type ApplySession = {
  id: string;
  applicationId: string;
  status: "RUNNING" | "WAITING_HUMAN" | "DONE" | "FAILED";
  startedAt: number;
  lastUrl?: string;
  error?: string;
};

type ApplySessionRuntime = {
  page?: Page;
  context?: BrowserContext;
};

const sessions = new Map<string, ApplySession>();
const runtimes = new Map<string, ApplySessionRuntime>();

function makeId() {
  return `apply_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createSession(applicationId: string): ApplySession {
  const session: ApplySession = {
    id: makeId(),
    applicationId,
    status: "RUNNING",
    startedAt: Date.now(),
  };
  sessions.set(session.id, session);
  return session;
}

export function updateSession(id: string, patch: Partial<ApplySession>) {
  const current = sessions.get(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  sessions.set(id, next);
  return next;
}

export function getSession(id: string) {
  return sessions.get(id);
}

export function deleteSession(id: string) {
  sessions.delete(id);
  runtimes.delete(id);
}

export function setSessionRuntime(id: string, runtime: ApplySessionRuntime) {
  const current = runtimes.get(id) ?? {};
  runtimes.set(id, { ...current, ...runtime });
}

export function getSessionRuntime(id: string) {
  return runtimes.get(id);
}

export async function closeSessionRuntime(id: string) {
  const runtime = runtimes.get(id);
  runtimes.delete(id);
  await runtime?.context?.close().catch(() => undefined);
}
