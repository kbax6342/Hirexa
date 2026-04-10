import type { ApplySessionStatus } from "@/app/lib/apply/sessionStatus";

export const AUTO_APPLY_POPUP_STORAGE_KEY = "hirexa_auto_apply_popup_state";
export const AUTO_APPLY_POPUP_INACTIVITY_MS = 5 * 60 * 60 * 1000;

export type AutoApplyPopupItem = {
  applicationId: string;
  applySessionId?: string | null;
  jobId: string;
  jobTitle: string;
  company: string;
  location?: string | null;
  status: ApplySessionStatus | string;
  message?: string | null;
  lastUrl?: string | null;
  updatedAt: number;
};

export type AutoApplyPopupState = {
  currentSessionKey: string;
  firstShownAt: number | null;
  lastActivityAt: number;
  dismissedAt: number | null;
  isOpen: boolean;
  items: Record<string, AutoApplyPopupItem>;
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function makeAutoApplyPopupSessionKey(now = Date.now()) {
  return `auto_apply_${now}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyAutoApplyPopupState(
  now = Date.now(),
): AutoApplyPopupState {
  return {
    currentSessionKey: makeAutoApplyPopupSessionKey(now),
    firstShownAt: null,
    lastActivityAt: now,
    dismissedAt: null,
    isOpen: false,
    items: {},
  };
}

export function isAutoApplyPopupStateExpired(
  state: AutoApplyPopupState | null | undefined,
  now = Date.now(),
) {
  if (!state) return true;
  return now - state.lastActivityAt > AUTO_APPLY_POPUP_INACTIVITY_MS;
}

export function loadAutoApplyPopupState() {
  if (!canUseLocalStorage()) return null;

  try {
    const raw = window.localStorage.getItem(AUTO_APPLY_POPUP_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AutoApplyPopupState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAutoApplyPopupState(state: AutoApplyPopupState) {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.setItem(
      AUTO_APPLY_POPUP_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Ignore storage quota and privacy mode errors.
  }
}

export function clearAutoApplyPopupState() {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.removeItem(AUTO_APPLY_POPUP_STORAGE_KEY);
  } catch {
    // Ignore storage quota and privacy mode errors.
  }
}
