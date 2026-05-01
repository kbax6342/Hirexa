"use client";

import { useSyncExternalStore } from "react";
import Script from "next/script";

import {
  getStoredCookieConsent,
  hasAnalyticsConsent,
  subscribeToCookieConsent,
} from "@/app/lib/cookies/consent";

const TIKTOK_PIXEL_ID = "D79E6M3C77UA3HU6E7GG";
const TIKTOK_PIXEL_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_TIKTOK_PIXEL === "true";

function getTikTokPixelInitScript(pixelId: string) {
  const safePixelId = JSON.stringify(pixelId);

  return `
    !function (w, d, t) {
      w.TiktokAnalyticsObject = t;
      var ttq = (w[t] = w[t] || []);
      ttq.methods = ["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
      ttq.setAndDefer = function (t, e) {
        t[e] = function () {
          t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
        };
      };
      for (var i = 0; i < ttq.methods.length; i++) {
        ttq.setAndDefer(ttq, ttq.methods[i]);
      }
      ttq.instance = function (t) {
        for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) {
          ttq.setAndDefer(e, ttq.methods[n]);
        }
        return e;
      };
      ttq.load = function (e, n) {
        var r = "https://analytics.tiktok.com/i18n/pixel/events.js";
        ttq._i = ttq._i || {};
        ttq._i[e] = [];
        ttq._i[e]._u = r;
        ttq._t = ttq._t || {};
        ttq._t[e] = +new Date();
        ttq._o = ttq._o || {};
        ttq._o[e] = n || {};
        var o = document.createElement("script");
        o.type = "text/javascript";
        o.async = true;
        o.src = r + "?sdkid=" + e + "&lib=" + t;
        var a = document.getElementsByTagName("script")[0];
        a.parentNode.insertBefore(o, a);
      };
      ttq.load(${safePixelId});
      ttq.page();
    }(window, document, "ttq");
  `;
}

export default function TikTokPixel() {
  const consent = useSyncExternalStore(
    subscribeToCookieConsent,
    getStoredCookieConsent,
    () => null
  );

  if (!TIKTOK_PIXEL_ENABLED || !hasAnalyticsConsent(consent)) {
    return null;
  }

  return (
    <Script id="tiktok-pixel" strategy="afterInteractive">
      {getTikTokPixelInitScript(TIKTOK_PIXEL_ID)}
    </Script>
  );
}
