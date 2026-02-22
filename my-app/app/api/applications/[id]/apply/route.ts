import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { mapProfileToForm } from "@/app/lib/greenhouse/mapProfileToForm";
import { parseGreenhouseForm } from "@/app/lib/greenhouse/parseGreenhouseForm";
import { buildApplyPayload } from "@/app/lib/applications/buildApplyPayload";

export const runtime = "nodejs";

type ApplyBody = {
  answers?: Record<string, string>;
};

function isSuccessHtml(html: string) {
  const text = html.toLowerCase();
  return ["thank you", "application submitted", "we have received"].some((phrase) => text.includes(phrase));
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = (await req.json()) as ApplyBody;
    const answers = body.answers ?? {};

    const application = await prisma.jobApplication.findFirst({
      where: {
        id,
        userProfile: {
          userId,
        },
      },
      include: {
        userProfile: true,
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    if (!application.jobUrl) {
      return NextResponse.json({ error: "Application missing jobUrl" }, { status: 400 });
    }

    await prisma.jobApplication.update({
      where: { id: application.id },
      data: {
        status: "IN_PROGRESS",
        answersJson: answers,
      },
    });

    const form = await parseGreenhouseForm(application.jobUrl);
    const { prefillValues, auditItems } = mapProfileToForm(form.fields, application.userProfile);

    const resume = await prisma.resumeFile.findFirst({
      where: {
        profileId: application.userProfileId,
        mimeType: "application/pdf",
      },
      orderBy: { createdAt: "desc" },
    });

    const resumeBytes = resume?.blob
      ? resume.blob instanceof Uint8Array
        ? resume.blob
        : new Uint8Array(resume.blob as ArrayBuffer)
      : undefined;

    const { payload, meta } = buildApplyPayload({
      answers,
      form,
      prefillValues,
      auditItems,
      resume: resumeBytes
        ? {
            fileName: resume?.fileName ?? null,
            mimeType: "application/pdf",
            bytes: resumeBytes,
          }
        : null,
    });

    if (meta.missing.length > 0) {
      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "IN_PREPARATION",
          auditJson: {
            form,
            prefill: prefillValues,
            auditItems,
            payload,
            meta,
          },
          answersJson: answers,
        },
      });

      return NextResponse.json(
        {
          error: "Please answer all required audit fields before applying.",
          missing: meta.missing,
        },
        { status: 400 }
      );
    }

    const fd = new FormData();
    Object.entries(payload.fields).forEach(([key, value]) => {
      if (value == null) return;
      if (typeof value === "object") return;
      fd.set(key, String(value));
    });

    if (resumeBytes && payload.fileFields.length > 0) {
      const resumeField = payload.fileFields[0];
      fd.set(
        resumeField.name,
        new Blob([resumeBytes], { type: resumeField.mimeType }),
        resumeField.fileName
      );
    }

    const submitRes = await fetch(payload.action, {
      method: payload.method,
      body: fd,
      redirect: "follow",
    });

    const responseHtml = await submitRes.text();
    const success = submitRes.ok && isSuccessHtml(responseHtml);

    if (!success) {
      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "IN_PREPARATION",
          auditJson: {
            form,
            prefill: prefillValues,
            auditItems,
            payload,
            meta,
          },
          answersJson: answers,
        },
      });

      return NextResponse.json(
        {
          error: "Greenhouse did not confirm the application submission.",
          statusCode: submitRes.status,
        },
        { status: 502 }
      );
    }

    await prisma.jobApplication.update({
      where: { id: application.id },
      data: {
        status: "SENT",
        submittedAt: new Date(),
        answersJson: answers,
        auditJson: {
          form,
          prefill: prefillValues,
          auditItems,
          payload,
          meta,
        },
      },
    });

    return NextResponse.json({ ok: true, status: "SENT" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
