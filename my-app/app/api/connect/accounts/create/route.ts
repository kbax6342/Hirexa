import { NextResponse } from "next/server";
import { getStripeClient } from "@/app/lib/stripeClient";

type Body = {
  displayName: string;   // from user
  contactEmail: string;  // from user
};

export async function POST(req: Request) {
  const stripeClient = getStripeClient();

  const body = (await req.json()) as Partial<Body>;
  const displayName = (body.displayName ?? "").trim();
  const contactEmail = (body.contactEmail ?? "").trim();

  if (!displayName || !contactEmail) {
    return NextResponse.json(
      { error: "displayName and contactEmail are required" },
      { status: 400 }
    );
  }

  // ✅ V2 Accounts create (ONLY the fields you provided)
  const account = await stripeClient.v2.core.accounts.create({
    display_name: displayName,
    contact_email: contactEmail,
    identity: {
      country: "us",
    },
    dashboard: "full",
    defaults: {
      responsibilities: {
        fees_collector: "stripe",
        losses_collector: "stripe",
      },
    },
    configuration: {
      customer: {},
      merchant: {
        capabilities: {
          card_payments: {
            requested: true,
          },
        },
      },
    },
  });

  /**
   * If you have a DB (Prisma) already:
   * TODO: store mapping from your User -> account.id
   * Example:
   *   await prisma.user.update({ where: { id: userId }, data: { stripeAccountId: account.id }})
   */

  return NextResponse.json({ accountId: account.id });
}
