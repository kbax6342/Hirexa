import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";

export const runtime = "nodejs";

function normalizeString(v: any) {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id ?? null;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const p = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      linkedinUrl: true,
      authorizedUS: true,
      sponsorship: true,
      felony: true,
      relocate: true,
      startDate: true,
      gender: true,
      pronouns: true,
      ethnicity: true,
      disability: true,
      veteran: true,
      keyQuestions: true,
    },
  });

  if (!p) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
  }

  // Build a clean payload for the extension
  const payload = {
    firstName: normalizeString(p.firstName),
    lastName: normalizeString(p.lastName),
    email: normalizeString(p.email),
    phone: normalizeString(p.phone),

    address1: normalizeString(p.address),
    city: normalizeString(p.city),
    state: normalizeString(p.state),
    zip: normalizeString(p.postalCode),
    country: "US",

    linkedinUrl: normalizeString(p.linkedinUrl),

    // common screening (as strings in your schema)
    authorizedUS: normalizeString(p.authorizedUS),     // "yes"/"no"/etc
    sponsorship: normalizeString(p.sponsorship),       // "yes"/"no"/etc
    felony: normalizeString(p.felony),
    relocate: normalizeString(p.relocate),
    startDate: normalizeString(p.startDate),

    gender: normalizeString(p.gender),
    pronouns: normalizeString(p.pronouns),
    ethnicity: normalizeString(p.ethnicity),
    disability: normalizeString(p.disability),
    veteran: normalizeString(p.veteran),

    // Any extra defaults you stored
    keyQuestions: p.keyQuestions ?? null,
  };

  return NextResponse.json({ ok: true, profile: payload });
}