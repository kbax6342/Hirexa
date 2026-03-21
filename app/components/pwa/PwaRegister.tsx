"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      console.info("[PWA] Service worker registration skipped outside production.");
      return;
    }

    let disposed = false;

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        if (!disposed) {
          console.info("[PWA] Service worker registered:", registration.scope);
        }
      } catch (error) {
        console.error("[PWA] Service worker registration failed:", error);
      }
    };

    if (document.readyState === "complete") {
      void registerServiceWorker();
    } else {
      window.addEventListener("load", registerServiceWorker, { once: true });
    }

    return () => {
      disposed = true;
      window.removeEventListener("load", registerServiceWorker);
    };
  }, []);

  return null;
}
