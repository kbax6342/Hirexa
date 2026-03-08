import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { getAuthedUserId } from "@/app/lib/agents/getAuthedUser";
import { buildLinkedInAuthUrl, getBaseUrl } from "@/app/lib/agents/linkedinOAuth";

export async function GET(req: Request) {
  const userId = await getAuthedUserId();
  const baseUrl = getBaseUrl(req);

  if (!userId) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set(
      "callbackUrl",
      "/job-tools/agents/linkedin-outreach"
    );
    return NextResponse.redirect(loginUrl);
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    const errorUrl = new URL("/job-tools/agents/linkedin-outreach", baseUrl);
    errorUrl.searchParams.set("linkedin_error", "missing_credentials");
    return NextResponse.redirect(errorUrl);
  }

  const state = randomUUID();
  const redirectUri = new URL(
    "/api/agents/linkedin/oauth/callback",
    baseUrl
  ).toString();

  const cookieStore = await cookies();
  cookieStore.set("linkedin_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  const authUrl = buildLinkedInAuthUrl({
    clientId,
    redirectUri,
    state,
    scope: "openid profile email",
  });

  console.info("[linkedin] auth url", authUrl);
  return NextResponse.redirect(authUrl);
}
