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
    if (txt.includes(",")) {
      return txt
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [txt];
  }

  if (Array.isArray(value)) {
    return toText(value[0]);
  }

  return toText(value);
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
    const answerValue = normalizeAnswer(savedAnswers[field.name], field);
    const prefillValue = normalizeAnswer(prefillValues[field.name], field);

    const finalValue: AnswerValue = Array.isArray(answerValue)
      ? answerValue.length > 0
        ? answerValue
        : Array.isArray(prefillValue)
          ? prefillValue
          : []
      : answerValue || (Array.isArray(prefillValue) ? "" : prefillValue) || "";

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
        form,
        computedPrefill: prefillValues,
        computedFinalValues: finalValuesToSubmit,
        missing: missingRequired,
        resume: resume
          ? {
              fileName: resume.fileName,
              mimeType: resume.mimeType,
            }
          : null,
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
    return buildAuditResponse(id, userId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as AuditBody;
    const { id } = await context.params;

    return buildAuditResponse(id, userId, body.answers ?? {});
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
