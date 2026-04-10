import type { ApplySessionStatus } from "@/app/lib/apply/sessionStatus";

export type ApplySessionClickRecord = {
  hop: number;
  fromUrl: string;
  toUrl?: string;
  selector: string;
  text?: string;
  navigation: "same-tab" | "popup" | "new-page";
};

export type ApplySessionDebug = {
  hopCount?: number;
  urlsVisited?: string[];
  clicks?: ApplySessionClickRecord[];
  formDetected?: boolean;
  confirmationDetected?: boolean;
  verificationDetected?: boolean;
  finalReason?: string;
};

export type ApplySession = {
  id: string;
  applicationId: string;
  status: ApplySessionStatus;
  startedAt: number;
  updatedAt: number;
  lastUrl?: string;
  error?: string;
  message?: string;
  remoteSessionId?: string;
  debug?: ApplySessionDebug;
};

const sessions = new Map<string, ApplySession>();

function makeId() {
  return `apply_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createSession(applicationId: string): ApplySession {
  const now = Date.now();
  const session: ApplySession = {
    id: makeId(),
    applicationId,
    status: "STARTING",
    startedAt: now,
    updatedAt: now,
  };
  sessions.set(session.id, session);
  return session;
}

export function updateSession(id: string, patch: Partial<ApplySession>) {
  const current = sessions.get(id);
  if (!current) return undefined;
  const next = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  sessions.set(id, next);
  return next;
}

export function getSession(id: string) {
  return sessions.get(id);
}

export function deleteSession(id: string) {
  sessions.delete(id);
}
