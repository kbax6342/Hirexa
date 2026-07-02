import { NextResponse } from "next/server";

import { auth } from "./auth";
import { getHirexaVerificationGateForUser } from "@/app/lib/auth/hirexaVerification";
import { getOnboardingStatusForUser } from "@/app/lib/onboarding/status";
import { getTwoFactorGateForUser } from "@/app/lib/security/twoFactorGate";
import {
  ONBOARDING_CONFIRMATION_ROUTE,
  VERIFY_ACCOUNT_ROUTE,
} from "@/app/lib/onboarding-flow";

const AUTH_REQUIRED_PREFIXES = [
  "/dashboard",
  "/plans",
  "/billing",
  "/hirepilot/app",
  "/settings",
  "/profile",
  "/applications",
  "/saved-jobs",
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
  ONBOARDING_CONFIRMATION_ROUTE,
];

const INCOMPLETE_ONBOARDING_BLOCKED_PREFIXES = [
  "/dashboard",
  "/job-tools/generate",
  "/hirepilot/app",
  "/job-tools/ai-assistant",
  "/settings",
  "/profile",
  "/applications",
];

const TWO_FACTOR_BLOCKED_PREFIXES = [
  "/dashboard",
  "/profile",
  "/settings",
  "/saved-jobs",
  "/billing",
  "/applications",
  "/hirepilot/app",
  "/job-tools",
  "/plans",
  "/agency",
  "/recruiter",
];

const TWO_FACTOR_ROUTE = "/auth/2fa";

function isPublicChatbotManagementPath(pathname: string) {
  return /^\/dashboard\/chatbots\/[^/]+\/(?:settings|bot-dashboard)\/?$/.test(
    pathname
  );
}

export default auth(async (req) => {
  const { pathname, search, origin } = req.nextUrl;
  const isAuthenticated = !!req.auth;
  const userId = (req.auth?.user as { id?: string } | undefined)?.id ?? null;

  if (isPublicChatbotManagementPath(pathname)) {
    return NextResponse.next();
  }

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

    const twoFactor = await getTwoFactorGateForUser(userId, req.cookies);
    if (
      twoFactor.requiresTwoFactor &&
      TWO_FACTOR_BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    ) {
      const twoFactorUrl = new URL(TWO_FACTOR_ROUTE, origin);
      twoFactorUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
      console.info("[TWO_FACTOR_GATE] dashboard blocked pending 2FA", {
        userId,
        pathname,
      });
      return NextResponse.redirect(twoFactorUrl);
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
        if (nextPath === ONBOARDING_CONFIRMATION_ROUTE) {
          console.info("[ONBOARDING_GATE] dashboard blocked pending confirmation", {
            userId,
            pathname,
          });
        }
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
    "/hirepilot/app/:path*",
    "/job-tools/:path*",
    "/job-tools/generate",
    "/job-tools/ai-assistant/:path*",
    "/benefits/:path*",
    "/plans/:path*",
    "/billing/:path*",
    "/settings/:path*",
    "/profile",
    "/applications/:path*",
    "/agency/:path*",
    "/recruiter/:path*",
    "/saved-jobs",
    "/auth/2fa",
    "/onboarding/profile/:path*",
    "/questions/step2Resume/:path*",
    "/onboarding/job-interest/:path*",
    "/onboarding/time-saved/:path*",
    "/onboarding/min-salary/:path*",
    "/onboarding/skills/:path*",
    "/onboarding/job-alerts/:path*",
    "/onboarding/choose-workplace/:path*",
    "/onboarding/account/:path*",
    "/onboarding/confirm/:path*",
  ],
};
