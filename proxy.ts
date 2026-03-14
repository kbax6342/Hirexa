import { NextResponse } from "next/server";

import { auth } from "./auth";
import { getOnboardingStatusForUser } from "@/app/lib/onboarding/status";

const AUTH_REQUIRED_PREFIXES = [
  "/dashboard",
  "/benefits",
  "/plans",
  "/onboarding/profile",
  "/hirepilot",
  "/settings",
  "/profile",
  "/applications",
];

const ONBOARDING_REDIRECT_PREFIXES = [
  "/resume",
  "/questions",
  "/questions/step2Resume",
  "/onboarding/job-interest",
  "/onboarding/time-saved",
  "/onboarding/min-salary",
  "/onboarding/skills",
  "/onboarding/job-alerts",
  "/onboarding/choose-workplace",
  "/onboarding/account",
  "/onboarding/profile",
];

const INCOMPLETE_ONBOARDING_BLOCKED_PREFIXES = [
  "/dashboard",
  "/job-tools/generate",
  "/job-tools/agents/linkedin-outreach",
  "/hirepilot",
  "/job-tools/ai-assistant",
  "/settings",
  "/profile",
  "/applications",
];

export default auth(async (req) => {
  const { pathname, search, origin } = req.nextUrl;
  const isAuthenticated = !!req.auth;
  const userId = (req.auth?.user as { id?: string } | undefined)?.id ?? null;

  if (
    isAuthenticated &&
    userId
  ) {
    const onboarding = await getOnboardingStatusForUser(userId);

    if (
      onboarding.completed &&
      ONBOARDING_REDIRECT_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    ) {
      return NextResponse.redirect(new URL("/dashboard", origin));
    }

    if (!onboarding.completed) {
      const nextPath = onboarding.nextPath ?? "/resume";

      if (pathname.startsWith("/onboarding/account")) {
        return NextResponse.redirect(new URL(nextPath, origin));
      }

      if (pathname === "/questions" && nextPath !== "/questions") {
        return NextResponse.redirect(new URL(nextPath, origin));
      }

      if (
        INCOMPLETE_ONBOARDING_BLOCKED_PREFIXES.some((prefix) =>
          pathname.startsWith(prefix)
        )
      ) {
        return NextResponse.redirect(new URL(nextPath, origin));
      }
    }
  }

  if (
    !isAuthenticated &&
    AUTH_REQUIRED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/resume",
    "/questions",
    "/dashboard/:path*",
    "/hirepilot",
    "/job-tools/generate",
    "/job-tools/agents/linkedin-outreach/:path*",
    "/job-tools/ai-assistant/:path*",
    "/benefits/:path*",
    "/plans/:path*",
    "/settings/:path*",
    "/profile",
    "/applications/:path*",
    "/onboarding/profile/:path*",
    "/questions/step2Resume/:path*",
    "/onboarding/job-interest/:path*",
    "/onboarding/time-saved/:path*",
    "/onboarding/min-salary/:path*",
    "/onboarding/skills/:path*",
    "/onboarding/job-alerts/:path*",
    "/onboarding/choose-workplace/:path*",
    "/onboarding/account/:path*",
  ],
};
