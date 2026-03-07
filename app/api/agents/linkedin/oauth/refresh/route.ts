import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getAuthedUserId, unauthorizedJson } from "@/app/lib/agents/getAuthedUser";
import { fetchLinkedInUserInfo } from "@/app/lib/agents/linkedinOAuth";

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

export async function POST() {
  try {
    const userId = await getAuthedUserId();
    if (!userId) return unauthorizedJson();

    const account = await prisma.linkedInAccount.findUnique({ where: { userId } });
    if (!account?.accessToken) {
      return NextResponse.json(
        { ok: false, error: "LinkedIn is not connected." },
        { status: 400 }
      );
    }

    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      return NextResponse.json(
        { ok: false, error: "LinkedIn session expired. Please reconnect." },
        { status: 401 }
      );
    }

    const profile = await fetchLinkedInUserInfo(account.accessToken);
    const importedName = buildName(profile);
    const email = profile.email ?? null;
    const profileSnapshot = await loadProfileSnapshot(userId);

    const updated = await prisma.linkedInAccount.update({
      where: { userId },
      data: {
        provider: "linkedin_oauth",
        providerAccountId: profile.sub ?? account.providerAccountId ?? null,
        email: email ?? account.email,
        importedName: importedName ?? undefined,
        importedSkills:
          profileSnapshot.skills.length > 0 ? profileSnapshot.skills : undefined,
        importedLocation: profileSnapshot.location ?? undefined,
      },
    });

    return NextResponse.json({ ok: true, connected: true, account: updated });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
