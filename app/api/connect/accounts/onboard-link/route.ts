import { NextResponse } from "next/server";
import { getSiteUrl } from "@/app/lib/site-url";
import { getStripeClient } from "@/app/lib/stripeClient";

export async function POST(req: Request) {
  const stripeClient = getStripeClient();

  const { accountId } = (await req.json()) as { accountId?: string };
  if (!accountId || !accountId.startsWith("acct_")) {
    return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });
  }

  const appUrl = getSiteUrl(req);

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
