import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";
import { cookies } from "next/headers";

const ALLOWED_EXPERTISE = ["Career", "Money", "Skills", "Company"] as const;

function parseExpertise(value: unknown) {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();
  for (const item of value) {
    const label = String(item ?? "").trim();
    if (!ALLOWED_EXPERTISE.includes(label as (typeof ALLOWED_EXPERTISE)[number])) continue;
    unique.add(label);
  }

  return Array.from(unique);
}

function mergeKeyQuestions(
  existing: unknown,
  expertise: string[]
): Record<string, unknown> {
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return { ...(existing as Record<string, unknown>), expertise };
  }

  return { expertise };
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const cookieStore = await cookies();
    const guestId = cookieStore.get("guest_user_id")?.value ?? null;

    if (!userId && !guestId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const expertise = parseExpertise(body?.expertise);

    const existing = await prisma.userProfile.findFirst({
      where: userId ? { userId } : { guestId },
      select: { id: true, keyQuestions: true },
    });

    const keyQuestions = mergeKeyQuestions(existing?.keyQuestions, expertise);

    const profile = existing
      ? await prisma.userProfile.update({
          where: { id: existing.id },
          data: { keyQuestions },
          select: { id: true, keyQuestions: true },
        })
      : await prisma.userProfile.create({
          data: {
            ...(userId ? { userId } : { guestId: guestId! }),
            keyQuestions,
          },
          select: { id: true, keyQuestions: true },
        });

    return NextResponse.json({
      ok: true,
      expertise:
        profile.keyQuestions &&
        typeof profile.keyQuestions === "object" &&
        !Array.isArray(profile.keyQuestions) &&
        Array.isArray((profile.keyQuestions as Record<string, unknown>).expertise)
          ? (profile.keyQuestions as Record<string, unknown>).expertise.map((item) => String(item))
          : [],
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
