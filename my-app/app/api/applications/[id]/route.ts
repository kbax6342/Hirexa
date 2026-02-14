import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

const ALLOWED_STATUSES = [
  "IN_PREPARATION",
  "READY_TO_SEND",
  "IN_PROGRESS",
  "SENT",
] as const;

type ApplicationStatus = (typeof ALLOWED_STATUSES)[number];

type UpdateApplicationBody = {
  status?: ApplicationStatus;
};

async function getProfileIdFromSession() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) return null;

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  return profile?.id ?? null;
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const profileId = await getProfileIdFromSession();
    if (!profileId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = (await req.json()) as UpdateApplicationBody;
    const status = body.status;

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const updated = await prisma.jobApplication.updateMany({
      where: { id, userProfileId: profileId },
      data: { status },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const profileId = await getProfileIdFromSession();
    if (!profileId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const removed = await prisma.jobApplication.deleteMany({
      where: { id, userProfileId: profileId },
    });

    if (removed.count === 0) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
