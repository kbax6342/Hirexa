import { NextResponse } from "next/server";

import { generateWorkStoryOptionsForRole } from "@/app/lib/onboarding/generateWorkStoryOptions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role");

  const result = await generateWorkStoryOptionsForRole(role);

  return NextResponse.json(
    {
      ok: true,
      role: role?.trim() || null,
      options: result.options,
      source: result.source,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
