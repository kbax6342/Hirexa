import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getHirePilotBillingStatus } from "@/app/lib/hirepilot/checkHirePilotAccess";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getHirePilotBillingStatus(userId);

  return NextResponse.json(status);
}
