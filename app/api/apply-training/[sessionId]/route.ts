import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import {
  getPlaywrightTrainingSession,
  stopPlaywrightTrainingSession,
} from "@/app/lib/apply/playwrightTrainingSession";

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
  const trainingSession = getPlaywrightTrainingSession(sessionId);

  if (!trainingSession) {
    return NextResponse.json(
      { ok: false, error: "Training session not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    session: trainingSession,
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const trainingSession = await stopPlaywrightTrainingSession(sessionId);

  if (!trainingSession) {
    return NextResponse.json(
      { ok: false, error: "Training session not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    session: trainingSession,
  });
}
