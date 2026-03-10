import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { auth } from "./auth";

const AUTH_REQUIRED_PREFIXES = [
  "/dashboard",
  "/benefits",
  "/plans",
  "/onboarding/profile",
];

const AUTHENTICATED_REDIRECT_PREFIXES = [
  "/questions/step2",
  "/onboarding/job-interest",
  "/onboarding/time-saved",
  "/onboarding/min-salary",
  "/onboarding/skills",
  "/onboarding/job-alerts",
  "/onboarding/choose-workplace",
  "/onboarding/account",
];

export default auth(async (req) => {
  const { pathname, search, origin } = req.nextUrl;
  const isAuthenticated = !!req.auth;
  const userId = (req.auth?.user as { id?: string } | undefined)?.id ?? null;

  if (isAuthenticated && pathname === "/questions" && userId) {
    const userProfile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { questionsCompleted: true },
    });

    if (userProfile?.questionsCompleted) {
      return NextResponse.redirect(new URL("/dashboard", origin));
    }
  }

  if (
    isAuthenticated &&
    AUTHENTICATED_REDIRECT_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.redirect(new URL("/dashboard", origin));
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
    "/questions",
    "/dashboard/:path*",
    "/benefits/:path*",
    "/plans/:path*",
    "/onboarding/profile/:path*",
    "/questions/step2/:path*",
    "/onboarding/job-interest/:path*",
    "/onboarding/time-saved/:path*",
    "/onboarding/min-salary/:path*",
    "/onboarding/skills/:path*",
    "/onboarding/job-alerts/:path*",
    "/onboarding/choose-workplace/:path*",
    "/onboarding/account/:path*",
  ],
};
