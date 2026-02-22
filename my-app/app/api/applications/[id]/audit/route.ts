import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { mapProfileToForm } from "@/app/lib/greenhouse/mapProfileToForm";
import { parseGreenhouseForm, type GhField } from "@/app/lib/greenhouse/parseGreenhouseForm";

export const runtime = "nodejs";

type AnswerValue = string | string[];
type AnswersMap = Record<string, AnswerValue>;

type AuditBody = {
  answers?: AnswersMap;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeAnswer(value: unknown, field: GhField): AnswerValue {
  if (field.type === "checkbox") {
    if (Array.isArray(value)) {
      return value.map((item) => toText(item)).filter(Boolean);
    }
    const txt = toText(value);
    if (!txt) return [];
    return txt
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return toText(value[0]);
  }

  return toText(value);
}

function mergeValue(field: GhField, answer: AnswerValue, hasAnswer: boolean, prefill: AnswerValue): AnswerValue {
  if (hasAnswer) return answer;
  if (field.type === "checkbox") return Array.isArray(prefill) ? prefill : [];
  return Array.isArray(prefill) ? prefill[0] ?? "" : prefill;
}

function isMissingRequired(field: GhField, value: AnswerValue, hasResume: boolean) {
  if (!field.required) return false;
  if (field.type === "file") return !hasResume;
  if (Array.isArray(value)) return value.length === 0;
  return value.length === 0;
}

async function buildAuditResponse(applicationId: string, userId: string, answersOverride?: AnswersMap) {
  const application = await prisma.jobApplication.findFirst({
    where: {
      id: applicationId,
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

  const form = await parseGreenhouseForm(application.jobUrl);
  const { prefillValues } = mapProfileToForm(form.fields, application.userProfile);
  const savedAnswers = answersOverride ?? ((application.answersJson as AnswersMap | null) ?? {});

  const resume = await prisma.resumeFile.findFirst({
    where: {
      profileId: application.userProfileId,
      mimeType: "application/pdf",
    },
    orderBy: { createdAt: "desc" },
  });

  const finalValuesToSubmit: AnswersMap = {};
  const missingRequired: string[] = [];

  for (const field of form.fields) {
    const hasAnswer = Object.prototype.hasOwnProperty.call(savedAnswers, field.name);
    const answerValue = normalizeAnswer(savedAnswers[field.name], field);
    const prefillValue = normalizeAnswer(prefillValues[field.name], field);
    const finalValue = mergeValue(field, answerValue, hasAnswer, prefillValue);

    finalValuesToSubmit[field.name] = finalValue;

    if (isMissingRequired(field, finalValue, Boolean(resume))) {
      missingRequired.push(field.name);
    }
  }

  const status = missingRequired.length > 0 ? "IN_PREPARATION" : "READY_TO_SEND";

  await prisma.jobApplication.update({
    where: { id: application.id },
    data: {
      status,
      answersJson: savedAnswers,
      auditJson: {
        form: {
          action: form.action,
          method: form.method,
          hidden: form.hidden,
          fields: form.fields,
        },
        computedPrefill: prefillValues,
        computedFinalValues: finalValuesToSubmit,
        missing: missingRequired,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    status,
    form,
    prefill: prefillValues,
    answers: savedAnswers,
    finalValuesToSubmit,
    missingRequired,
    resume: resume
      ? {
          fileName: resume.fileName,
          mimeType: resume.mimeType,
        }
      : null,
  });
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

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

    const form = await parseGreenhouseForm(application.jobUrl);
    const { prefillValues, auditItems } = mapProfileToForm(form.fields, application.userProfile);
    console.log("GH parse debug:", form.debug);
    console.log("GH fields count:", form.fields.length, "method:", form.method, "action:", form.action);

    const status = auditItems.filter((item) => item.required).length > 0 ? "IN_PREPARATION" : "READY_TO_SEND";

    await prisma.jobApplication.update({
      where: { id: application.id },
      data: {
        status,
        auditJson: {
          form,
          prefill: prefillValues,
          auditItems,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      status,
      prefill: prefillValues,
      auditItems,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
