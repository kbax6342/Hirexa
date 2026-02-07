import { NextResponse } from "next/server";
import type { WorkExperience } from "../parse/route";

export const runtime = "nodejs";

declare global {
  // eslint-disable-next-line no-var
  var __resumeExperiences: WorkExperience[] | undefined;
}

export async function GET() {
  return NextResponse.json({
    experiences: globalThis.__resumeExperiences ?? [],
  });
}
