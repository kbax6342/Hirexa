import { NextResponse } from "next/server";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

type SaveJobBody = {
  jobId?: unknown;
  title?: unknown;
  company?: unknown;
  location?: unknown;
  url?: unknown;
};

type DeleteSavedJobBody = {
  jobId?: unknown;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function getUserId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as SaveJobBody;
    const jobId = normalizeText(body.jobId);
    const title = normalizeText(body.title);
    const company = normalizeText(body.company);
    const location = normalizeText(body.location) || null;
    const url = normalizeText(body.url);

    if (!jobId || !title || !company || !url) {
      return NextResponse.json(
        { error: "jobId, title, company, and url are required." },
        { status: 400 }
      );
    }

    const savedJob = await prisma.savedJob.upsert({
      where: {
        userId_jobId: {
          userId,
          jobId,
        },
      },
      create: {
        userId,
        jobId,
        title,
        company,
        location,
        url,
      },
      update: {
        title,
        company,
        location,
        url,
      },
      select: {
        id: true,
        jobId: true,
        title: true,
        company: true,
        location: true,
        url: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, job: savedJob });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await getUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as DeleteSavedJobBody;
    const jobId = normalizeText(body.jobId);

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }

    await prisma.savedJob.deleteMany({
      where: {
        userId,
        jobId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
