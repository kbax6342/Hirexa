"use client";

import { useSyncExternalStore } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SessionProvider } from "next-auth/react";

import CookieConsentBanner from "@/app/components/cookies/CookieConsentBanner";
import {
  createCookieConsent,
  getCookieConsentReadySnapshot,
  getStoredCookieConsent,
  hasAnalyticsConsent,
  persistCookieConsent,
  subscribeToCookieConsent,
} from "@/app/lib/cookies/consent";

export default function Providers({ children }: { children: React.ReactNode }) {
  const consent = useSyncExternalStore(
    subscribeToCookieConsent,
    getStoredCookieConsent,
    () => null
  );
  const consentReady = useSyncExternalStore(
    subscribeToCookieConsent,
    getCookieConsentReadySnapshot,
    () => false
  );

  function updateConsent(nextConsent: ReturnType<typeof createCookieConsent>) {
    persistCookieConsent(nextConsent);
  }

  return (
    <SessionProvider>
      {children}
      <CookieConsentBanner
        ready={consentReady}
        consent={consent}
        onAcceptAll={() =>
          updateConsent(createCookieConsent({ analytics: true }))
        }
        onRejectNonEssential={() =>
          updateConsent(createCookieConsent({ analytics: false }))
        }
        onSavePreferences={(preferences) =>
          updateConsent(
            createCookieConsent({ analytics: preferences.analytics })
          )
        }
      />
      {hasAnalyticsConsent(consent) ? (
        <>
          <Analytics />
          <SpeedInsights />
        </>
      ) : null}
    </SessionProvider>
  );
}
