import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { startPlaywrightTrainingSession } from "@/app/lib/apply/playwrightTrainingSession";

export const runtime = "nodejs";

type StartTrainingBody = {
  hostname?: string;
  finalUrl?: string;
  stopReason?: string;
  lastAction?: string;
};

function resolveHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .trim()
      .toLowerCase();
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as StartTrainingBody;
    const finalUrl = String(body.finalUrl ?? "").trim();
    const hostname = resolveHostname(String(body.hostname ?? finalUrl));
    const stopReason = String(body.stopReason ?? "").trim();
    const lastAction = String(body.lastAction ?? "").trim();

    if (!finalUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing finalUrl." },
        { status: 400 },
      );
    }

    if (!hostname) {
      return NextResponse.json(
        { ok: false, error: "Missing hostname." },
        { status: 400 },
      );
    }

    const trainingSession = await startPlaywrightTrainingSession({
      hostname,
      finalUrl,
      stopReason,
      lastAction,
    });

    return NextResponse.json({
      ok: true,
      session: trainingSession,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start training session.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
