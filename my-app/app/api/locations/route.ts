import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../lib/prisma";
import { auth } from "../../../auth";

type LocationInput = { label: string; lat?: number; lon?: number };

function normalizeLabel(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;

    if (!userId && !guestId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const includeRemote = Boolean(body?.includeRemote);

    const incoming: LocationInput[] = Array.isArray(body?.locations) ? body.locations : [];

    // sanitize + dedupe (max 5)
    const seen = new Set<string>();
    const cleaned: LocationInput[] = [];

    for (const item of incoming) {
      const label = normalizeLabel(String(item?.label ?? ""));
      if (!label) continue;

      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const lat = item?.lat;
      const lon = item?.lon;

      cleaned.push({
        label,
        lat: Number.isFinite(lat as any) ? Number(lat) : undefined,
        lon: Number.isFinite(lon as any) ? Number(lon) : undefined,
      });

      if (cleaned.length >= 5) break;
    }

    if (cleaned.length === 0) {
      return NextResponse.json({ ok: false, error: "Please add at least 1 location." }, { status: 400 });
    }

    // ✅ SAVE TO DB (UserProfile)
    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId! },
      create: userId
        ? { userId, workplaceLocations: cleaned as any, includeRemote }
        : { guestId: guestId!, workplaceLocations: cleaned as any, includeRemote },
      update: { workplaceLocations: cleaned as any, includeRemote },
      select: {
        id: true,
        userId: true,
        guestId: true,
        includeRemote: true,
        workplaceLocations: true,
        updatedAt: true,
      },
    });

    // ✅ SET COOKIES (server-visible; httpOnly)
    const res = NextResponse.json({
      ok: true,
      proof: {
        session: { userId, guestId },
        savedToProfile: profile,
        cookiesSet: {
          onboarding_locations_count: String(cleaned.length),
          onboarding_include_remote: String(includeRemote),
        },
      },
    });

    res.cookies.set("onboarding_locations", JSON.stringify(cleaned), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    res.cookies.set("onboarding_locations_count", String(cleaned.length), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    res.cookies.set("onboarding_include_remote", String(includeRemote), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to save locations" }, { status: 500 });
  }
}
