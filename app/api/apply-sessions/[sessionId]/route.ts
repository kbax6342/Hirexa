import { NextResponse } from "next/server";
import {
  getApplySessionStorageBackend,
  getSession,
} from "@/app/lib/apply/applySessionStore";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const session = getSession(sessionId, {
    caller: "GET /api/apply-sessions/[sessionId]",
    sourcePath: "app/api/apply-sessions/[sessionId]/route.ts",
    phase: "poll",
  });
  const storageBackendUsed = getApplySessionStorageBackend();

  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        found: false,
        error: "Apply session not found.",
        storageBackendUsed,
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    found: true,
    storageBackendUsed,
    session,
  });
}
