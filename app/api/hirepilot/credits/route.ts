import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getHirePilotCreditSummary } from "@/app/lib/hirepilot/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await getHirePilotCreditSummary(userId);
  return NextResponse.json(summary);
}
