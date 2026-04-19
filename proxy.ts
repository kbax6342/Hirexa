import { NextResponse } from "next/server";

import { auth } from "./auth";
import { getHirexaVerificationGateForUser } from "@/app/lib/auth/hirexaVerification";
import { getOnboardingStatusForUser } from "@/app/lib/onboarding/status";
import { VERIFY_ACCOUNT_ROUTE } from "@/app/lib/onboarding-flow";

const AUTH_REQUIRED_PREFIXES = [
  "/dashboard",
  "/plans",
  "/hirepilot",
  "/settings",
  "/profile",
  "/applications",
  "/agency",
  "/recruiter",
];

const ONBOARDING_REDIRECT_PREFIXES = [
  "/resume",
  "/questions",
  "/benefits",
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
    const verification = await getHirexaVerificationGateForUser(userId);
    if (verification.requiresVerification) {
      const verifyUrl = new URL(VERIFY_ACCOUNT_ROUTE, origin);
      verifyUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
      return NextResponse.redirect(verifyUrl);
    }

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
    if (pathname.startsWith("/recruiter") || pathname.startsWith("/agency")) {
      loginUrl.searchParams.set("mode", "recruiter");
    }
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
    "/job-tools/:path*",
    "/job-tools/generate",
    "/job-tools/ai-assistant/:path*",
    "/benefits/:path*",
    "/plans/:path*",
    "/settings/:path*",
    "/profile",
    "/applications/:path*",
    "/agency/:path*",
    "/recruiter/:path*",
    "/saved-jobs",
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
