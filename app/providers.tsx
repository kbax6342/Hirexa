"use client";

import { useSyncExternalStore } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SessionProvider } from "next-auth/react";

import CookieConsentBanner from "@/app/components/cookies/CookieConsentBanner";
import ShareSafeProvider from "@/app/components/ShareSafeProvider";
import { Toaster } from "@/app/components/ui/toaster";
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
      <ShareSafeProvider>
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
        <Toaster />
        {hasAnalyticsConsent(consent) ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </ShareSafeProvider>
    </SessionProvider>
  );
}
