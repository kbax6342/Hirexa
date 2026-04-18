import { NextResponse } from "next/server";

import {
  getOrCreateRecruiterProfile,
  saveRecruiterProfile,
} from "@/app/lib/recruiter/profile";
import { requireRecruiterAgencyForApi } from "@/app/lib/recruiter/server";

export async function GET() {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  try {
    const snapshot = await getOrCreateRecruiterProfile({
      userId: context.userId,
      agency: context.agency,
    });

    return NextResponse.json({
      ok: true,
      profile: snapshot.profile,
      completion: snapshot.completion,
      checklist: snapshot.checklist,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load recruiter profile.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body) {
    return NextResponse.json(
      { ok: false, error: "Invalid recruiter profile payload." },
      { status: 400 }
    );
  }

  try {
    const snapshot = await saveRecruiterProfile({
      userId: context.userId,
      agency: context.agency,
      input: body,
    });

    return NextResponse.json({
      ok: true,
      profile: snapshot.profile,
      completion: snapshot.completion,
      checklist: snapshot.checklist,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to save recruiter profile.",
      },
      { status: 500 }
    );
  }
}
