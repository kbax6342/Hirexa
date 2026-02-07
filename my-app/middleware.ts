// middleware.ts
export { auth as middleware } from "../my-app/auth";

export const config = {
  matcher: ["/dashboard/:path*"],
};
