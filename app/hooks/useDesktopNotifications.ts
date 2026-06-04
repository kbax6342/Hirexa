"use client";

import { useCallback, useEffect, useState } from "react";

import {
  type DesktopNotificationPayload,
  type DesktopNotificationPermissionState,
  getDesktopNotificationPermissionState,
  isDesktopNotificationSupported,
  requestDesktopNotificationPermission as requestBrowserNotificationPermission,
  sendDesktopBrowserNotification,
} from "@/app/lib/notifications/desktopNotifications";

export function useDesktopNotifications() {
  const [permission, setPermission] =
    useState<DesktopNotificationPermissionState>("default");
  const [isSupported, setIsSupported] = useState(false);

  const syncNotificationState = useCallback(() => {
    const supported = isDesktopNotificationSupported();
    setIsSupported(supported);
    setPermission(
      supported ? getDesktopNotificationPermissionState() : "unsupported"
    );
  }, []);

  useEffect(() => {
    syncNotificationState();

    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("focus", syncNotificationState);
    document.addEventListener("visibilitychange", syncNotificationState);

    return () => {
      window.removeEventListener("focus", syncNotificationState);
      document.removeEventListener("visibilitychange", syncNotificationState);
    };
  }, [syncNotificationState]);

  const requestPermission = useCallback(async () => {
    const nextPermission = await requestBrowserNotificationPermission();
    setIsSupported(nextPermission !== "unsupported");
    setPermission(nextPermission);
    return nextPermission;
  }, []);

  const sendNotification = useCallback(
    (payload: DesktopNotificationPayload) => {
      syncNotificationState();
      return sendDesktopBrowserNotification(payload);
    },
    [syncNotificationState]
  );

  return {
    isSupported,
    permission,
    requestPermission,
    sendNotification,
    canNotify: isSupported && permission === "granted",
  };
}
