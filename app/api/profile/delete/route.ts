import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Profile deletion now requires the confirmed Settings > Danger Zone flow.",
    },
    { status: 400 }
  );
}
