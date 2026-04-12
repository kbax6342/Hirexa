import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { getPlaywrightStrategyReplaySession } from "@/app/lib/apply/playwrightStrategyReplay";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const replaySession = getPlaywrightStrategyReplaySession(sessionId);

  if (!replaySession) {
    return NextResponse.json(
      { ok: false, error: "Replay session not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    session: replaySession,
  });
}
