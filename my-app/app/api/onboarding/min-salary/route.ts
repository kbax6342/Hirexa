import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../../lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const compensationType =
      body?.compensationType === "hourly" ? "hourly" : "yearly";

    const minCompRaw = Number(body?.minCompensation);
    const minComp = Math.round(minCompRaw);

    if (!Number.isFinite(minComp) || minComp <= 0) {
      return NextResponse.json({ error: "Invalid min compensation" }, { status: 400 });
    }

    // ✅ Next 15+: cookies() is async; Next 13/14: still works with await in practice.
    const cookieStore = await cookies();
    const userId = cookieStore.get("guest_user_id")?.value;

    if (!userId) {
      return NextResponse.json({ error: "No onboarding session" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userProfile: true },
    });

    const profileId = user?.userProfile?.id;
    if (!user?.isGuest || !profileId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }

    await prisma.userProfile.update({
      where: { id: profileId },
      data: {
        minCompensation: minComp,
        compensationType,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
