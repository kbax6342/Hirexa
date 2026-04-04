import { NextResponse } from "next/server";

import { validateUsLocation } from "@/app/lib/location/validateUsLocation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city");
  const state = searchParams.get("state");
  const postalCode = searchParams.get("postalCode");

  const result = await validateUsLocation({ city, state, postalCode });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
