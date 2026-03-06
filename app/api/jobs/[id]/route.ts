// app/api/jobs/[id]/route.ts
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // TODO: load from your DB or wherever you store fetched jobs
  // const job = await db.job.findUnique({ where: { uuid: id } });
  const job = null; // replace this

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}
