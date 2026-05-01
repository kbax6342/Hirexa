import type { ReactNode } from "react";

export const SHARE_SAFE_MODE_STORAGE_KEY = "hirexa:share-safe-mode";
export const SHARE_SAFE_MINIMIZE_STORAGE_KEY =
  "hirexa:share-safe-minimize-when-hiding";
export const SHARE_SAFE_SHORTCUT_LABEL = "Ctrl + Shift + H";
export const SHARE_SAFE_LIMITATION_COPY =
  "Share-Safe Mode hides sensitive Hirexa AI content and enables desktop capture protection where supported. Some operating systems or screen-sharing apps may still capture protected windows. For best privacy, share a specific window or tab instead of your entire screen.";
export const SHARE_SAFE_NOTIFICATION_TITLE = "Hirexa notification hidden";
export const SHARE_SAFE_NOTIFICATION_DESCRIPTION =
  "Sensitive Hirexa content is hidden while Share-Safe Mode is on.";

export type SensitiveContentMode = "hide" | "blur" | "replace";
export type SensitiveContentDisposition =
  | "children"
  | SensitiveContentMode;

export type ShareSafeDesktopBridge = {
  setShareSafeContentProtection?: (
    enabled: boolean
  ) => Promise<boolean | void> | boolean | void;
  getShareSafeContentProtectionState?: () => Promise<boolean> | boolean;
  minimizeWindow?: () => Promise<void> | void;
};

export type ShareSafeNotificationContent = {
  title?: ReactNode;
  description?: ReactNode;
};

export function readStoredBooleanPreference(
  storage: Pick<Storage, "getItem"> | null | undefined,
  key: string,
  fallback = false
) {
  if (!storage) return fallback;

  try {
    const value = storage.getItem(key);
    if (value === "true") return true;
    if (value === "false") return false;
  } catch {
    return fallback;
  }

  return fallback;
}

export function writeStoredBooleanPreference(
  storage: Pick<Storage, "setItem"> | null | undefined,
  key: string,
  value: boolean
) {
  if (!storage) return;

  try {
    storage.setItem(key, value ? "true" : "false");
  } catch {
    // Ignore storage write failures so Share-Safe Mode still works in-memory.
  }
}

export function isShareSafeToggleShortcut(
  event: Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
  >
) {
  return (
    event.ctrlKey &&
    event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    event.key.toLowerCase() === "h"
  );
}

export function maskShareSafeNotification(
  enabled: boolean,
  content: ShareSafeNotificationContent
) {
  if (!enabled) return content;

  return {
    title: SHARE_SAFE_NOTIFICATION_TITLE,
    description: SHARE_SAFE_NOTIFICATION_DESCRIPTION,
  } satisfies ShareSafeNotificationContent;
}

export function getSensitiveContentDisposition(
  enabled: boolean,
  mode: SensitiveContentMode
): SensitiveContentDisposition {
  return enabled ? mode : "children";
}

export function shouldSuppressShareSafeFloatingUi(enabled: boolean) {
  return enabled;
}

export async function applyShareSafeDesktopBridge(args: {
  bridge?: ShareSafeDesktopBridge;
  enabled: boolean;
  minimizeWhenHiding: boolean;
}) {
  const { bridge, enabled, minimizeWhenHiding } = args;

  await Promise.resolve(bridge?.setShareSafeContentProtection?.(enabled));

  if (enabled && minimizeWhenHiding) {
    await Promise.resolve(bridge?.minimizeWindow?.());
  }
}
