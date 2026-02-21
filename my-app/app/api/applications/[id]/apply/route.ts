import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { mapProfileToForm } from "@/app/lib/greenhouse/mapProfileToForm";
import { parseGreenhouseForm } from "@/app/lib/greenhouse/parseGreenhouseForm";

export const runtime = "nodejs";

type ApplyBody = {
  answers?: Record<string, string>;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function isSuccessHtml(html: string) {
  const text = html.toLowerCase();
  return ["thank you", "application submitted", "we have received"].some((phrase) => text.includes(phrase));
}

function pickResumeFieldName(fields: Array<{ name: string; label: string; type: string }>) {
  const fileFields = fields.filter((field) => field.type === "file");
  if (!fileFields.length) return "resume";

  const resumeField = fileFields.find((field) => {
    const text = `${field.name} ${field.label}`.toLowerCase();
    return text.includes("resume") || text.includes("cv");
  });

  return resumeField?.name ?? fileFields[0].name;
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
    const requiredAudit = auditItems.filter((item) => item.required);

    const missingAnswers = requiredAudit.filter((item) => !normalizeText(answers[item.name]));
    if (missingAnswers.length > 0) {
      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "IN_PREPARATION",
          auditJson: {
            form,
            prefill: prefillValues,
            auditItems,
          },
          answersJson: answers,
        },
      });

      return NextResponse.json(
        {
          error: "Please answer all required audit fields before applying.",
          missing: missingAnswers,
        },
        { status: 400 }
      );
    }

    const fd = new FormData();

    Object.entries(form.hidden).forEach(([key, value]) => {
      fd.set(key, value);
    });

    Object.entries(prefillValues).forEach(([key, value]) => {
      fd.set(key, value);
    });

    Object.entries(answers).forEach(([key, value]) => {
      fd.set(key, normalizeText(value));
    });

    const resume = await prisma.resumeFile.findFirst({
      where: {
        profileId: application.userProfileId,
        mimeType: "application/pdf",
      },
      orderBy: { createdAt: "desc" },
    });

    if (resume?.blob) {
      const resumeFieldName = pickResumeFieldName(form.fields);
      const bytes = resume.blob instanceof Uint8Array ? resume.blob : new Uint8Array(resume.blob as ArrayBuffer);
      fd.set(resumeFieldName, new Blob([bytes], { type: "application/pdf" }), resume.fileName || "resume.pdf");
    }

    const submitRes = await fetch(form.action, {
      method: form.method || "POST",
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
        },
      },
    });

    return NextResponse.json({ ok: true, status: "SENT" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
