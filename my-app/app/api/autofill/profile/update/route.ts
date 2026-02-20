import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id ?? null;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const updated = await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      email: body.email ?? null,
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      phone: body.phone ?? null,
      address: body.address1 ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      postalCode: body.zip ?? null,
      linkedinUrl: body.linkedinUrl ?? null,

      authorizedUS: body.authorizedUS ?? null,
      sponsorship: body.sponsorship ?? null,
      felony: body.felony ?? null,
      relocate: body.relocate ?? null,
      startDate: body.startDate ?? null,

      gender: body.gender ?? null,
      pronouns: body.pronouns ?? null,
      ethnicity: body.ethnicity ?? null,
      disability: body.disability ?? null,
      veteran: body.veteran ?? null,

      keyQuestions: body.keyQuestions ?? null,
    },
    update: {
      email: body.email ?? undefined,
      firstName: body.firstName ?? undefined,
      lastName: body.lastName ?? undefined,
      phone: body.phone ?? undefined,
      address: body.address1 ?? undefined,
      city: body.city ?? undefined,
      state: body.state ?? undefined,
      postalCode: body.zip ?? undefined,
      linkedinUrl: body.linkedinUrl ?? undefined,

      authorizedUS: body.authorizedUS ?? undefined,
      sponsorship: body.sponsorship ?? undefined,
      felony: body.felony ?? undefined,
      relocate: body.relocate ?? undefined,
      startDate: body.startDate ?? undefined,

      gender: body.gender ?? undefined,
      pronouns: body.pronouns ?? undefined,
      ethnicity: body.ethnicity ?? undefined,
      disability: body.disability ?? undefined,
      veteran: body.veteran ?? undefined,

      keyQuestions: body.keyQuestions ?? undefined,
    },
    select: { id: true, userId: true },
  });

  return NextResponse.json({ ok: true, updated });
}