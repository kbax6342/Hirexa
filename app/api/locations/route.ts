import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../lib/prisma";
import { auth } from "../../../auth";

type LocationInput = { label: string; lat?: number; lon?: number };

function normalizeLabel(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function readFirstLocation(raw: unknown): LocationInput | null {
  if (!Array.isArray(raw)) return null;

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const label = normalizeLabel(String((item as { label?: unknown }).label ?? ""));
    if (!label) continue;

    const lat = (item as { lat?: unknown }).lat;
    const lon = (item as { lon?: unknown }).lon;
    return {
      label,
      lat: Number.isFinite(lat as any) ? Number(lat) : undefined,
      lon: Number.isFinite(lon as any) ? Number(lon) : undefined,
    };
  }

  return null;
}

export async function GET() {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;

    let location: LocationInput | null = null;
    let includeRemote: boolean | null = null;

    if (userId || guestId) {
      const profile = await prisma.userProfile.findUnique({
        where: userId ? { userId } : { guestId: guestId as string },
        select: {
          workplaceLocations: true,
          includeRemote: true,
        },
      });

      if (profile?.workplaceLocations) {
        location = readFirstLocation(profile.workplaceLocations);
      }

      if (typeof profile?.includeRemote === "boolean") {
        includeRemote = profile.includeRemote;
      }
    }

    if (!location) {
      const cookieLocations = c.get("onboarding_locations")?.value ?? null;
      if (cookieLocations) {
        try {
          const parsed = JSON.parse(cookieLocations);
          location = readFirstLocation(parsed);
        } catch {
          // ignore cookie parse errors
        }
      }
    }

    if (includeRemote === null) {
      const cookieRemote = c.get("onboarding_include_remote")?.value;
      if (cookieRemote === "true" || cookieRemote === "false") {
        includeRemote = cookieRemote === "true";
      }
    }

    return NextResponse.json({
      ok: true,
      location,
      includeRemote,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to load locations" }, { status: 500 });
  }
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

    const incomingArray: LocationInput[] = Array.isArray(body?.locations) ? body.locations : [];
    const incomingSingle: LocationInput | null =
      body?.location && typeof body.location === "object" ? body.location : null;

    // Single-select: take the first valid location only.
    const candidate = incomingSingle ?? incomingArray[0] ?? null;
    const cleaned: LocationInput[] = [];

    if (candidate) {
      const label = normalizeLabel(String(candidate?.label ?? ""));
      if (label) {
        const lat = candidate?.lat;
        const lon = candidate?.lon;

        cleaned.push({
          label,
          lat: Number.isFinite(lat as any) ? Number(lat) : undefined,
          lon: Number.isFinite(lon as any) ? Number(lon) : undefined,
        });
      }
    }

    if (cleaned.length === 0) {
      return NextResponse.json({ ok: false, error: "Please select a city." }, { status: 400 });
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
