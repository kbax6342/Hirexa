import { NextResponse } from "next/server";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import {
  BILLING_PRODUCT_KEYS,
} from "@/app/lib/billing/userBilling";
import {
  cancelSubscriptionAtPeriodEnd,
  createBillingPortalUrl,
  type ManagedSubscriptionProductKey,
} from "@/app/lib/billing/subscriptionManagement";
import { getHirePilotCreditSummary } from "@/app/lib/hirepilot/credits";
import {
  sendHirePilotCancellationConfirmationEmail,
  sendHirexaCancellationConfirmationEmail,
} from "@/app/lib/email/sendgrid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CancelBody = {
  productKey?: string | null;
  reason?: string | null;
};

function isManagedProductKey(value: string | null | undefined): value is ManagedSubscriptionProductKey {
  return (
    value === BILLING_PRODUCT_KEYS.HIREXA_CORE ||
    value === BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY
  );
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as CancelBody | null;
    const productKey = body?.productKey?.trim() ?? null;
    if (!isManagedProductKey(productKey)) {
      return NextResponse.json(
        { ok: false, error: "Select a valid subscription to cancel." },
        { status: 400 }
      );
    }

    const canceled = await cancelSubscriptionAtPeriodEnd({
      userId,
      productKey,
    });

    if (!canceled) {
      const portalUrl = await createBillingPortalUrl({
        userId,
        req,
        returnPath: "/settings/subscription",
      });

      if (portalUrl) {
        return NextResponse.json(
          {
            ok: false,
            error: "No active subscription was found for that product.",
            portalUrl,
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { ok: false, error: "No active subscription was found for that product." },
        { status: 404 }
      );
    }

    invalidateCachedProfile({ userId, guestId: null });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
      },
    });

    if (user?.email) {
      Promise.resolve()
        .then(async () => {
          if (productKey === BILLING_PRODUCT_KEYS.HIREPILOT_MONTHLY) {
            const credits = await getHirePilotCreditSummary(userId);
            await sendHirePilotCancellationConfirmationEmail({
              to: user.email as string,
              name: user.name,
              endsAt: canceled.currentPeriodEnd,
              purchasedCreditsRemaining: credits.purchasedCredits,
            });
            return;
          }

          await sendHirexaCancellationConfirmationEmail({
            to: user.email as string,
            name: user.name,
            endsAt: canceled.currentPeriodEnd,
          });
        })
        .catch((error) => {
          console.error("[subscription cancel] email failed", error);
        });
    }

    return NextResponse.json({
      ok: true,
      message: `${canceled.label} will stay active through the current billing period and then cancel.`,
      productKey,
      currentPeriodEnd: canceled.currentPeriodEnd,
    });
  } catch (error) {
    console.error("[subscription cancel] failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to cancel your subscription right now." },
      { status: 500 }
    );
  }
}
