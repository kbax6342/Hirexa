import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { deriveSourceFromUrl, normalizeJobUrl } from "@/app/lib/jobSources";

export const runtime = "nodejs";

type CreateBody = {
  source?: string;
  sourceJobId?: string;
  jobUrl?: string;
  title?: string;
  company?: string;
  location?: string;
};

const text = (value: unknown) => String(value ?? "").trim();

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as CreateBody;
  const sourceJobId = text(body.sourceJobId) || null;
  const jobUrl = normalizeJobUrl(text(body.jobUrl));
  const source = text(body.source) || deriveSourceFromUrl(jobUrl);
  const title = text(body.title) || "Untitled role";
  const company = text(body.company) || "Unknown company";
  const location = text(body.location) || null;

  const profile = await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, email: session?.user?.email ?? null },
    update: {},
    select: { id: true },
  });

  const application = sourceJobId
    ? await prisma.jobApplication.upsert({
        where: { userProfileId_sourceJobId: { userProfileId: profile.id, sourceJobId } },
        create: {
          userProfileId: profile.id,
          source,
          sourceJobId,
          jobUrl: jobUrl || null,
          title,
          jobTitle: title,
          company,
          location,
          status: "READY_TO_APPLY",
        },
        update: {
          source,
          jobUrl: jobUrl || null,
          title,
          jobTitle: title,
          company,
          location,
          status: "READY_TO_APPLY",
        },
        select: { id: true },
      })
    : await prisma.jobApplication.create({
        data: {
          userProfileId: profile.id,
          source,
          jobUrl: jobUrl || null,
          sourceJobId,
          title,
          jobTitle: title,
          company,
          location,
          status: "READY_TO_APPLY",
        },
        select: { id: true },
      });

  return NextResponse.json({ ok: true, applicationId: application.id });
}
