"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  SHARE_SAFE_MINIMIZE_STORAGE_KEY,
  SHARE_SAFE_MODE_STORAGE_KEY,
  applyShareSafeDesktopBridge,
  isShareSafeToggleShortcut,
  readStoredBooleanPreference,
  writeStoredBooleanPreference,
} from "@/app/lib/shareSafe";

import ShareSafeBadge from "./ShareSafeBadge";
import ShareSafePrivacyOverlay from "./ShareSafePrivacyOverlay";

export type ShareSafeContextValue = {
  desktopBridgeAvailable: boolean;
  minimizeWhenHiding: boolean;
  setMinimizeWhenHiding: (enabled: boolean) => void;
  setShareSafeMode: (enabled: boolean) => void;
  shareSafeMode: boolean;
  toggleShareSafeMode: () => void;
};

const ShareSafeContext = createContext<ShareSafeContextValue | null>(null);

type ShareSafeProviderProps = {
  children: ReactNode;
  initialMinimizeWhenHiding?: boolean;
  initialShareSafeMode?: boolean;
  persistState?: boolean;
};

export default function ShareSafeProvider({
  children,
  initialMinimizeWhenHiding = false,
  initialShareSafeMode = false,
  persistState = true,
}: ShareSafeProviderProps) {
  const [shareSafeMode, setShareSafeModeState] = useState(initialShareSafeMode);
  const [minimizeWhenHiding, setMinimizeWhenHidingState] = useState(
    initialMinimizeWhenHiding
  );
  const [desktopBridgeAvailable, setDesktopBridgeAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const bridge = window.hirexaDesktop ?? window.electronAPI;
    setDesktopBridgeAvailable(
      Boolean(
        bridge?.setShareSafeContentProtection ||
          bridge?.getShareSafeContentProtectionState ||
          bridge?.minimizeWindow
      )
    );

    if (!persistState) {
      return;
    }

    setShareSafeModeState(
      readStoredBooleanPreference(
        window.localStorage,
        SHARE_SAFE_MODE_STORAGE_KEY,
        initialShareSafeMode
      )
    );
    setMinimizeWhenHidingState(
      readStoredBooleanPreference(
        window.localStorage,
        SHARE_SAFE_MINIMIZE_STORAGE_KEY,
        initialMinimizeWhenHiding
      )
    );

    let cancelled = false;

    async function syncFromDesktopBridge() {
      try {
        const contentProtected = await Promise.resolve(
          bridge?.getShareSafeContentProtectionState?.()
        );

        if (!cancelled && typeof contentProtected === "boolean") {
          setShareSafeModeState(contentProtected);
        }
      } catch {
        // Ignore bridge read failures and keep the in-app state.
      }
    }

    void syncFromDesktopBridge();

    return () => {
      cancelled = true;
    };
  }, [initialMinimizeWhenHiding, initialShareSafeMode, persistState]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const modeValue = shareSafeMode ? "on" : "off";
    document.documentElement.dataset.shareSafeMode = modeValue;
    document.body.dataset.shareSafeMode = modeValue;
  }, [shareSafeMode]);

  useEffect(() => {
    if (!persistState || typeof window === "undefined") {
      return;
    }

    writeStoredBooleanPreference(
      window.localStorage,
      SHARE_SAFE_MODE_STORAGE_KEY,
      shareSafeMode
    );
  }, [persistState, shareSafeMode]);

  useEffect(() => {
    if (!persistState || typeof window === "undefined") {
      return;
    }

    writeStoredBooleanPreference(
      window.localStorage,
      SHARE_SAFE_MINIMIZE_STORAGE_KEY,
      minimizeWhenHiding
    );
  }, [minimizeWhenHiding, persistState]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    async function syncDesktopProtection() {
      try {
        await applyShareSafeDesktopBridge({
          bridge: window.hirexaDesktop ?? window.electronAPI,
          enabled: shareSafeMode,
          minimizeWhenHiding,
        });
      } catch {
        // Ignore bridge failures so the in-app privacy mode still works.
      }
    }

    void syncDesktopProtection();
  }, [minimizeWhenHiding, shareSafeMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!isShareSafeToggleShortcut(event)) return;

      event.preventDefault();
      setShareSafeModeState((current) => !current);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function setShareSafeMode(enabled: boolean) {
    setShareSafeModeState(enabled);
  }

  function toggleShareSafeMode() {
    setShareSafeModeState((current) => !current);
  }

  const value: ShareSafeContextValue = {
    desktopBridgeAvailable,
    minimizeWhenHiding,
    setMinimizeWhenHiding: setMinimizeWhenHidingState,
    setShareSafeMode,
    shareSafeMode,
    toggleShareSafeMode,
  };

  return (
    <ShareSafeContext.Provider value={value}>
      {children}
      {shareSafeMode ? <ShareSafeBadge floating /> : null}
      <ShareSafePrivacyOverlay />
    </ShareSafeContext.Provider>
  );
}

export function useShareSafe() {
  const context = useContext(ShareSafeContext);

  if (!context) {
    throw new Error("useShareSafe must be used within a ShareSafeProvider.");
  }

  return context;
}
