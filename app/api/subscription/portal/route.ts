import { NextResponse } from "next/server";

import { auth } from "@/app/lib/auth";
import { createBillingPortalUrl } from "@/app/lib/billing/subscriptionManagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = await createBillingPortalUrl({
      userId,
      req,
      returnPath: "/settings/subscription",
    });

    if (!url) {
      return NextResponse.json(
        {
          ok: false,
          error: "No billing portal is available for this account yet.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, url });
  } catch (error) {
    console.error("[subscription portal] failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to open billing settings right now." },
      { status: 500 }
    );
  }
}
