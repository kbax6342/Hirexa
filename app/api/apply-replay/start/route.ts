import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { startPlaywrightStrategyReplaySession } from "@/app/lib/apply/playwrightStrategyReplay";

export const runtime = "nodejs";

type ReplayStepInput = {
  id: string;
  type: "goto" | "navigation" | "click" | "fill" | "select_option" | "toggle";
  selector?: string;
  label?: string;
  text?: string;
  value?: string;
  checked?: boolean;
  currentUrl: string;
  timestamp: string;
};

type StartReplayBody = {
  hostname?: string;
  finalUrl?: string;
  currentUrl?: string;
  stopReason?: string;
  lastAction?: string;
  strategy?: {
    finalUrl?: string;
    lastTrainedUrl?: string;
    steps?: ReplayStepInput[];
  };
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

function pickFirstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const next = String(value ?? "").trim();
    if (next) return next;
  }

  return "";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as StartReplayBody;
    const strategy = body.strategy;
    const steps = Array.isArray(strategy?.steps) ? strategy.steps : [];
    const startUrl = pickFirstNonEmpty(
      body.currentUrl,
      body.finalUrl,
      strategy?.lastTrainedUrl,
      strategy?.finalUrl,
    );
    const finalUrl = pickFirstNonEmpty(body.finalUrl, strategy?.finalUrl, startUrl);
    const hostname = resolveHostname(
      pickFirstNonEmpty(body.hostname, startUrl, finalUrl),
    );
    const stopReason = String(body.stopReason ?? "").trim();
    const lastAction = String(body.lastAction ?? "").trim();

    if (!hostname) {
      return NextResponse.json(
        { ok: false, error: "Missing hostname." },
        { status: 400 },
      );
    }

    if (!startUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing replay start URL." },
        { status: 400 },
      );
    }

    if (steps.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Saved strategy does not contain recorded steps." },
        { status: 400 },
      );
    }

    const replaySession = startPlaywrightStrategyReplaySession({
      hostname,
      startUrl,
      finalUrl,
      stopReason,
      lastAction,
      steps,
    });

    return NextResponse.json({
      ok: true,
      session: replaySession,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start strategy replay.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
