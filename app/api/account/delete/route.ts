import { NextResponse } from "next/server";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import { cancelAllSubscriptionsImmediately } from "@/app/lib/billing/subscriptionManagement";
import { sendAccountDeletionConfirmationEmail } from "@/app/lib/email/sendgrid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeleteBody = {
  confirmationText?: string | null;
};

async function performAccountDeletion(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.linkedInAccount.deleteMany({ where: { userId } });
    await tx.outreachCampaign.deleteMany({ where: { userId } });
    await tx.hirePilotUsage.deleteMany({ where: { userId } });
    await tx.hirePilotCreditUsage.deleteMany({ where: { userId } });
    await tx.hirePilotCreditGrant.deleteMany({ where: { userId } });
    await tx.jobHunterPack.deleteMany({ where: { userId } });
    await tx.purchase.deleteMany({ where: { userId } });
    await tx.subscription.deleteMany({ where: { userId } });
    await tx.stripeCustomer.deleteMany({ where: { userId } });
    await tx.userBilling.deleteMany({ where: { userId } });

    if (profile?.id) {
      await tx.stripePayment.deleteMany({ where: { userProfileId: profile.id } });
      await tx.userProfile.deleteMany({ where: { id: profile.id } });
    }

    await tx.user.delete({ where: { id: userId } });
  });
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as DeleteBody | null;
    if (body?.confirmationText?.trim() !== "DELETE") {
      return NextResponse.json(
        { ok: false, error: "Type DELETE to confirm account deletion." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
      },
    });

    const canceledProducts = await cancelAllSubscriptionsImmediately(userId);
    await performAccountDeletion(userId);
    invalidateCachedProfile({ userId, guestId: null });

    if (user?.email) {
      Promise.resolve()
        .then(() =>
          sendAccountDeletionConfirmationEmail({
            to: user.email as string,
            name: user.name,
            canceledProducts,
          })
        )
        .catch((error) => {
          console.error("[account delete] email failed", error);
        });
    }

    return NextResponse.json({ ok: true, canceledProducts });
  } catch (error) {
    console.error("[account delete] failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to delete your account right now." },
      { status: 500 }
    );
  }
}
