import { NextResponse } from "next/server";

import { scoreStaffingLead } from "@/app/lib/staffing/scoreStaffingLead";
import {
  type StaffingLeadApiError,
  staffingLeadSubmissionSchema,
} from "@/app/types/staffing-screening";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = staffingLeadSubmissionSchema.safeParse(body);

    if (!parsed.success) {
      const payload: StaffingLeadApiError = {
        ok: false,
        error: "Complete the candidate screening details before submitting.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };

      return NextResponse.json(payload, { status: 400 });
    }

    const { score, tier, recommendedAction } = scoreStaffingLead(parsed.data);

    return NextResponse.json({
      ok: true,
      leadId: `demo_lead_${crypto.randomUUID()}`,
      score,
      tier,
      recommendedAction,
      companySlug: parsed.data.companySlug,
      companyName: parsed.data.companyName,
      sourcePage: parsed.data.sourcePage,
    });
  } catch (error) {
    console.error("[demo/screening-leads] failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to process the screening demo right now.",
      } satisfies StaffingLeadApiError,
      { status: 500 }
    );
  }
}
