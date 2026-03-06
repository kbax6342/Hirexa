import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

function extractIframeSrc(html: string): string | null {
  const iframeRegex = /<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  const iframeSources: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = iframeRegex.exec(html)) !== null) {
    iframeSources.push(match[1]);
  }

  if (iframeSources.length === 0) return null;

  return (
    iframeSources.find((src) => src.includes("boards.greenhouse.io")) ??
    iframeSources.find((src) => src.includes("greenhouse")) ??
    iframeSources[0]
  );
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const application = await prisma.jobApplication.findFirst({
      where: {
        id,
        userProfile: {
          userId,
        },
      },
      select: {
        jobTitle: true,
        jobUrl: true,
        company: true,
        location: true,
      },
    });

    if (!application) {
      return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    }

    if (!application.jobUrl) {
      return NextResponse.json({ ok: false, error: "Application missing jobUrl" }, { status: 400 });
    }

    let embedUrl = application.jobUrl;
    let warning: string | undefined;

    try {
      const response = await fetch(application.jobUrl, {
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; HirexaAuditEmbed/1.0)",
        },
      });

      if (!response.ok) {
        warning = `Unable to fetch job HTML (status ${response.status}). Falling back to jobUrl.`;
      } else {
        const html = await response.text();
        const iframeSrc = extractIframeSrc(html);

        if (iframeSrc) {
          embedUrl = new URL(iframeSrc, application.jobUrl).toString();
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown fetch error";
      warning = `Unable to fetch job HTML (${message}). Falling back to jobUrl.`;
    }

    return NextResponse.json({
      ok: true,
      jobTitle: application.jobTitle,
      jobUrl: application.jobUrl,
      company: application.company,
      location: application.location,
      embedUrl,
      ...(warning ? { warning } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
