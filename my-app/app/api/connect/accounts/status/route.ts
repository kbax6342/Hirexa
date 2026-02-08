import { NextResponse } from "next/server";
import { getStripeClient } from "@/app/lib/stripeClient";

export async function GET(req: Request) {
  const stripeClient = getStripeClient();

  const url = new URL(req.url);
  const accountId = (url.searchParams.get("accountId") ?? "").trim();

  if (!accountId.startsWith("acct_")) {
    return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });
  }

  const account = await stripeClient.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant", "requirements"],
  });

  const readyToProcessPayments =
    account?.configuration?.merchant?.capabilities?.card_payments?.status ===
    "active";

  const requirementsStatus =
    account?.requirements?.summary?.minimum_deadline?.status;

  const onboardingComplete =
    requirementsStatus !== "currently_due" && requirementsStatus !== "past_due";

  return NextResponse.json({
    accountId,
    readyToProcessPayments,
    requirementsStatus,
    onboardingComplete,
  });
}

