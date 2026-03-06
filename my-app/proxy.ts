import { auth } from "@/lib/auth/server";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/applications/:path*",
    "/onboarding/:path*",
    "/profile/:path*",
    "/benefits/:path*",
  ],
};

export default auth.middleware({ loginUrl: "/login" });
