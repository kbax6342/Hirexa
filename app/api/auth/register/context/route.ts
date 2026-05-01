import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import { resolveVerificationContext } from "@/app/lib/verification/context";
import { VERIFICATION_CHANNEL_SMS } from "@/app/lib/verification/types";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const cookieStore = await cookies();

  const context = await resolveVerificationContext({
    userId,
    sessionEmail: session?.user?.email ? String(session.user.email) : null,
    cookieStore,
  });

  return NextResponse.json({
    ok: true,
    channel: context.preferredChannel,
    resolvedChannel: context.resolvedChannel,
    destinationLabel: context.destinationLabel,
    email: context.email,
    hasValidPhone:
      context.preferredChannel !== VERIFICATION_CHANNEL_SMS ||
      Boolean(context.normalizedPhone),
  });
}
