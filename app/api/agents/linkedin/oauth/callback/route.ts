import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { getAuthedUserId } from "@/app/lib/agents/getAuthedUser";
import {
  exchangeLinkedInCodeForToken,
  fetchLinkedInUserInfo,
  getBaseUrl,
  parseLinkedInIdToken,
} from "@/app/lib/agents/linkedinOAuth";

type OidcNameSource = {
  name?: string;
  given_name?: string;
  family_name?: string;
};

function buildName(info: OidcNameSource | null) {
  if (!info) return null;
  if (info.name) return info.name;
  const full = [info.given_name, info.family_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  return null;
}

function dedupeSkills(skills: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const skill of skills) {
    const trimmed = skill.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function buildLocation(profile: {
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
}) {
  const parts = [profile.city?.trim(), profile.state?.trim()].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  if (profile.address?.trim()) return profile.address.trim();
  if (profile.country?.trim()) return profile.country.trim();
  return null;
}

async function loadProfileSnapshot(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      skills: true,
      resumeSkills: true,
      city: true,
      state: true,
      country: true,
      address: true,
    },
  });

  const combined = [...(profile?.skills ?? []), ...(profile?.resumeSkills ?? [])];

  return {
    skills: dedupeSkills(combined),
    location: profile
      ? buildLocation({
          city: profile.city ?? null,
          state: profile.state ?? null,
          country: profile.country ?? null,
          address: profile.address ?? null,
        })
      : null,
  };
}

export async function GET(req: Request) {
  const userId = await getAuthedUserId();
  const baseUrl = getBaseUrl(req);
  const redirectToDashboard = new URL("/dashboard", baseUrl);

  if (!userId) {
    redirectToDashboard.searchParams.set("linkedin_error", "unauthorized");
    console.info("[linkedin] redirect", redirectToDashboard.toString());
    return NextResponse.redirect(redirectToDashboard);
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    redirectToDashboard.searchParams.set("linkedin_error", error);
    console.info("[linkedin] redirect", redirectToDashboard.toString());
    return NextResponse.redirect(redirectToDashboard);
  }

  if (!code || !state) {
    redirectToDashboard.searchParams.set("linkedin_error", "missing_code");
    console.info("[linkedin] redirect", redirectToDashboard.toString());
    return NextResponse.redirect(redirectToDashboard);
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("linkedin_oauth_state")?.value ?? null;
  cookieStore.delete("linkedin_oauth_state");

  if (!storedState || storedState !== state) {
    redirectToDashboard.searchParams.set("linkedin_error", "invalid_state");
    console.info("[linkedin] redirect", redirectToDashboard.toString());
    return NextResponse.redirect(redirectToDashboard);
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    redirectToDashboard.searchParams.set("linkedin_error", "missing_credentials");
    return NextResponse.redirect(redirectToDashboard);
  }

  try {
    const redirectUri = new URL(
      "/api/agents/linkedin/oauth/callback",
      baseUrl
    ).toString();
    const token = await exchangeLinkedInCodeForToken({
      code,
      redirectUri,
      clientId,
      clientSecret,
    });

    const idTokenClaims = parseLinkedInIdToken(token.id_token);
    let userInfo = null;
    try {
      userInfo = await fetchLinkedInUserInfo(token.access_token);
    } catch (err) {
      if (!idTokenClaims) throw err;
    }

    const profile = userInfo ?? idTokenClaims;
    const importedName = buildName(profile);
    const providerAccountId = profile?.sub ?? idTokenClaims?.sub ?? null;
    const email = profile?.email ?? idTokenClaims?.email ?? null;
    const profileSnapshot = await loadProfileSnapshot(userId);

    const existing = await prisma.linkedInAccount.findUnique({
      where: { userId },
      select: {
        importedHeadline: true,
        importedLocation: true,
        importedSkills: true,
      },
    });

    const expiresAt = new Date(Date.now() + (token.expires_in ?? 0) * 1000);
    const nextSkills =
      profileSnapshot.skills.length > 0
        ? profileSnapshot.skills
        : existing?.importedSkills ?? [];
    const nextLocation = profileSnapshot.location ?? existing?.importedLocation ?? null;

    await prisma.linkedInAccount.upsert({
      where: { userId },
      create: {
        userId,
        provider: "linkedin_oauth",
        providerAccountId,
        email: email ?? null,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        tokenExpiresAt: Number.isFinite(expiresAt.getTime()) ? expiresAt : null,
        tokenScope: token.scope ?? null,
        connectedAt: new Date(),
        importedName,
        importedHeadline: existing?.importedHeadline ?? null,
        importedLocation: nextLocation,
        importedSkills: nextSkills,
      },
      update: {
        provider: "linkedin_oauth",
        providerAccountId,
        email: email ?? undefined,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        tokenExpiresAt: Number.isFinite(expiresAt.getTime()) ? expiresAt : null,
        tokenScope: token.scope ?? null,
        connectedAt: new Date(),
        importedName: importedName ?? undefined,
        importedSkills:
          profileSnapshot.skills.length > 0 ? profileSnapshot.skills : undefined,
        importedLocation: profileSnapshot.location ?? undefined,
      },
    });

    redirectToDashboard.searchParams.set("linkedin", "connected");
    console.info("[linkedin] redirect", redirectToDashboard.toString());
    return NextResponse.redirect(redirectToDashboard);
  } catch {
    redirectToDashboard.searchParams.set("linkedin_error", "oauth_failed");
    console.info("[linkedin] redirect", redirectToDashboard.toString());
    return NextResponse.redirect(redirectToDashboard);
  }
}
