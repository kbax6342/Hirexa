// middleware.ts
export { auth as middleware } from "./auth";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/benefits/:path*",
    "/plans/:path*",
    "/onboarding/profile/:path*",
  ],
};
