"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { META_PIXEL_ID, trackMetaPageView } from "@/app/lib/meta-pixel";

export default function MetaPixelPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasTrackedInitialRouteChange = useRef(false);
  const search = searchParams?.toString() ?? "";

  useEffect(() => {
    if (!META_PIXEL_ID) return;

    if (!hasTrackedInitialRouteChange.current) {
      hasTrackedInitialRouteChange.current = true;
      return;
    }

    trackMetaPageView();
  }, [pathname, search]);

  return null;
}
