import { NextResponse } from "next/server";

import { auth } from "@/app/lib/auth";
import { sendManualInterviewPrepReminder } from "@/app/lib/email/lifecycle";

export const runtime = "nodejs";

type InterviewPrepBody = {
  jobTitle?: string;
  company?: string | null;
  interviewAt?: string | null;
  focusAreas?: string[];
};

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as InterviewPrepBody | null;
  const jobTitle = cleanText(body?.jobTitle);
  const company = cleanText(body?.company);
  const interviewAt = cleanText(body?.interviewAt);
  const focusAreas = Array.isArray(body?.focusAreas)
    ? body!.focusAreas.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 6)
    : [];

  if (!jobTitle) {
    return NextResponse.json(
      { ok: false, error: "jobTitle is required" },
      { status: 400 }
    );
  }

  try {
    const result = await sendManualInterviewPrepReminder({
      userId,
      jobTitle,
      company,
      interviewAt,
      focusAreas,
    });

    return NextResponse.json({ ok: true, sent: result.sent, reason: result.reason });
  } catch (error) {
    console.error("[email/interview-prep] failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: "Unable to send interview prep reminder." },
      { status: 500 }
    );
  }
}
