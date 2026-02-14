// middleware.ts
import { NextResponse } from "next/server";

import { auth } from "./auth";

export default auth((req) => {
  if (req.auth) return NextResponse.next();

  const loginUrl = new URL("/login", req.nextUrl.origin);
  loginUrl.searchParams.set(
    "callbackUrl",
    `${req.nextUrl.pathname}${req.nextUrl.search}`,
  );

  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/benefits/:path*",
    "/plans/:path*",
    "/onboarding/profile/:path*",
  ],
};
