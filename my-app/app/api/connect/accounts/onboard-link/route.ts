import { NextResponse } from "next/server";
import { getStripeClient } from "@/app/lib/stripeClient";

export async function POST(req: Request) {
  const stripeClient = getStripeClient();

  const { accountId } = (await req.json()) as { accountId?: string };
  if (!accountId || !accountId.startsWith("acct_")) {
    return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      {
        error:
          "Missing NEXT_PUBLIC_APP_URL. Add it to /Hirexa/my-app/.env.local (e.g., http://localhost:3000).",
      },
      { status: 500 }
    );
  }

  // ✅ V2 account links create (as specified)
  const accountLink = await stripeClient.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "customer"],
        refresh_url: `${appUrl}/dashboard/connect?accountId=${accountId}&refresh=1`,
        return_url: `${appUrl}/dashboard/connect?accountId=${accountId}&return=1`,
      },
    },
  });

  return NextResponse.json({ url: accountLink.url });
}
