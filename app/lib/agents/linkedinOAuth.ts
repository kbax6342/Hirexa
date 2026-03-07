import "server-only";

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

export type LinkedInTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  id_token?: string;
};

export type LinkedInUserInfo = {
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  locale?: string;
};

export function getBaseUrl(req: Request) {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(req.url).origin
  );
}

export function buildLinkedInAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope: string;
}) {
  const authParams = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    state: params.state,
    scope: params.scope,
  });

  return `${LINKEDIN_AUTH_URL}?${authParams.toString()}`;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1]
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");

  try {
    const json = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseLinkedInIdToken(
  idToken?: string | null
): LinkedInUserInfo | null {
  if (!idToken) return null;
  const payload = decodeJwtPayload(idToken);
  if (!payload) return null;

  return {
    sub: typeof payload.sub === "string" ? payload.sub : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    given_name:
      typeof payload.given_name === "string" ? payload.given_name : undefined,
    family_name:
      typeof payload.family_name === "string" ? payload.family_name : undefined,
    email: typeof payload.email === "string" ? payload.email : undefined,
    email_verified:
      typeof payload.email_verified === "boolean"
        ? payload.email_verified
        : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
    locale: typeof payload.locale === "string" ? payload.locale : undefined,
  };
}

export async function exchangeLinkedInCodeForToken(params: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<LinkedInTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
  });

  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as LinkedInTokenResponse | null;
  if (!res.ok || !data?.access_token) {
    throw new Error("Failed to exchange LinkedIn OAuth code.");
  }

  return data;
}

export async function fetchLinkedInUserInfo(
  accessToken: string
): Promise<LinkedInUserInfo> {
  const res = await fetch(LINKEDIN_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as LinkedInUserInfo | null;
  if (!res.ok || !data) {
    throw new Error("Failed to fetch LinkedIn userinfo.");
  }

  return data;
}
