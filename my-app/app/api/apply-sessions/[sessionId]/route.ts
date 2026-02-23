import { NextResponse } from "next/server";
import { getSession } from "@/app/lib/apply/applySessionStore";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const session = getSession(sessionId);

  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Session not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, session });
}
