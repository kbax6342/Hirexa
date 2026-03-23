const DEFAULT_META_PIXEL_ID = "1154730535299362";

export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || DEFAULT_META_PIXEL_ID;

type FbqArgument = string | number | boolean | Record<string, unknown> | undefined;

type FbqFunction = {
  (...args: FbqArgument[]): void;
  callMethod?: (...args: FbqArgument[]) => void;
  queue?: FbqArgument[][];
  loaded?: boolean;
  version?: string;
  push?: FbqFunction;
};

declare global {
  interface Window {
    fbq?: FbqFunction;
    _fbq?: FbqFunction;
  }
}

export function getMetaPixelInitScript(pixelId: string) {
  const safePixelId = JSON.stringify(pixelId);

  return `
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', ${safePixelId});
    fbq('track', 'PageView');
  `;
}

export function getMetaPixelNoscriptUrl(pixelId: string) {
  return `https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`;
}

export function trackMetaPageView() {
  if (typeof window === "undefined" || typeof window.fbq !== "function") {
    return;
  }

  window.fbq("track", "PageView");
}
