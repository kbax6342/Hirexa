import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth"; // adjust if needed

export const runtime = "nodejs";

async function getUserId() {
  const session = await auth();
  // Auth.js sometimes exposes id directly or as session.user.id depending on callbacks
  const userId = (session?.user as any)?.id as string | undefined;
  return userId ?? null;
}

export async function GET() {
  try {
    const userId = await getUserId();

    // ✅ Not logged in -> not completed (no red error)
    if (!userId) {
      return NextResponse.json({ completed: false, data: null }, { status: 200 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId }, // ✅ this is unique in your schema
      select: { keyQuestions: true, registrationStatus: true },
    });

    const keyQuestions = (profile?.keyQuestions as any) ?? null;
    const completed =
      !!keyQuestions || profile?.registrationStatus === "KEY_QUESTIONS_COMPLETE";

    return NextResponse.json({ completed, data: keyQuestions }, { status: 200 });
  } catch (err: any) {
    console.error("GET key-questions failed:", err);
    return NextResponse.json(
      { error: err?.message || "Server error in GET key-questions." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const payload = {
      authorizedUS: String(body.authorizedUS ?? "").trim(),
      sponsorship: String(body.sponsorship ?? "").trim(),
      felony: String(body.felony ?? "").trim(),
      startDate: String(body.startDate ?? "").trim(),
      screening: String(body.screening ?? "").trim(),
      relocate: String(body.relocate ?? "").trim(),
      gender: String(body.gender ?? "").trim(),
      pronouns: String(body.pronouns ?? "").trim(),
      ethnicity: String(body.ethnicity ?? "").trim(),
      disability: String(body.disability ?? "").trim(),
      veteran: String(body.veteran ?? "").trim(),
    };

    if (!payload.authorizedUS || !payload.sponsorship || !payload.felony) {
      return NextResponse.json(
        { error: "Please answer the required questions." },
        { status: 400 }
      );
    }

    // ✅ Upsert profile by userId (safe even if profile row doesn't exist yet)
    await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        registrationStatus: "KEY_QUESTIONS_COMPLETE",
        keyQuestions: payload,
        ...payload,
      },
      update: {
        registrationStatus: "KEY_QUESTIONS_COMPLETE",
        keyQuestions: payload,
        ...payload,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("POST key-questions failed:", err);
    return NextResponse.json(
      { error: err?.message || "Server error in POST key-questions." },
      { status: 500 }
    );
  }
}
