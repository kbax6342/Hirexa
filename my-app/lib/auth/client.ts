"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import { useEffect, useState } from "react";

export const authClient = createAuthClient();

export type NeonSession = Awaited<ReturnType<typeof authClient.getSession>>;

export function useNeonSession() {
  const [data, setData] = useState<NeonSession | null>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await authClient.getSession();
        if (!cancelled) {
          setData(s);
          setStatus(s?.user ? "authenticated" : "unauthenticated");
        }
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, status };
}
