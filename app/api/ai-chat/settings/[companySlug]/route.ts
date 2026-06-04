import { NextResponse } from "next/server";

import { getCompanyChatSettingsBySlug } from "@/app/lib/ai-chat/companyChatSettingsStore";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    companySlug: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const settings = getCompanyChatSettingsBySlug(params.companySlug);

  return NextResponse.json({
    ok: true,
    settings,
  });
}
