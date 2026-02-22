import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { mapProfileToForm } from "@/app/lib/greenhouse/mapProfileToForm";
import { parseGreenhouseForm, type GhField } from "@/app/lib/greenhouse/parseGreenhouseForm";

export const runtime = "nodejs";

type AnswerValue = string | string[];
type AnswersMap = Record<string, AnswerValue>;

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

function mergeValue(
  field: GhField,
  answer: AnswerValue,
  hasAnswer: boolean,
  prefill: AnswerValue
): AnswerValue {
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
      include: {
        userProfile: true,
      },
    });

    if (!application) {
      return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    }

    if (!application.jobUrl) {
      return NextResponse.json({ ok: false, error: "Application missing jobUrl" }, { status: 400 });
    }

    // 1) Parse the real GH application form (your parser is now fixed)
    const form = await parseGreenhouseForm(application.jobUrl);

    // 2) Map profile -> prefill + audit items (may be undefined)
    const mapped = mapProfileToForm(form.fields, application.userProfile);
    const prefillValues = (mapped as any)?.prefillValues ?? {};
    const auditItems = Array.isArray((mapped as any)?.auditItems) ? (mapped as any).auditItems : [];

    // 3) Load saved answers (if any)
    const savedAnswers = ((application.answersJson as AnswersMap | null) ?? {}) as AnswersMap;

    // 4) Find latest resume PDF (required for file field)
    const resume = await prisma.resumeFile.findFirst({
      where: {
        profileId: application.userProfileId,
        mimeType: "application/pdf",
      },
      orderBy: { createdAt: "desc" },
    });

    // 5) Compute final values + missing required
    const finalValuesToSubmit: AnswersMap = {};
    const missingRequired: string[] = [];

    for (const field of form.fields) {
      const hasAnswer = Object.prototype.hasOwnProperty.call(savedAnswers, field.name);
      const answerValue = normalizeAnswer(savedAnswers[field.name], field);
      const prefillValue = normalizeAnswer((prefillValues as any)[field.name], field);
      const finalValue = mergeValue(field, answerValue, hasAnswer, prefillValue);

      finalValuesToSubmit[field.name] = finalValue;

      if (isMissingRequired(field, finalValue, Boolean(resume))) {
        missingRequired.push(field.name);
      }
    }

    const status = missingRequired.length > 0 ? "IN_PREPARATION" : "READY_TO_SEND";

    // Helpful logs while you stabilize this
    console.log("GH parse debug:", form.debug);
    console.log("GH fields count:", form.fields.length, "method:", form.method, "action:", form.action);

    // 6) Build fieldStates for your UI (single column list)
    const fieldStates = form.fields.map((f) => {
      const v = finalValuesToSubmit[f.name];
      const has = Object.prototype.hasOwnProperty.call(savedAnswers, f.name);

      return {
        path: f.name,
        label: f.label,
        type: f.type,
        required: f.required,
        value: v,
        isMissing: missingRequired.includes(f.name),
        rawValue: (prefillValues as any)[f.name],
        submittedValue: has ? savedAnswers[f.name] : undefined,
        options: f.options ?? undefined,
      };
    });

    // 7) Persist audit snapshot
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
            debug: form.debug,
          },
          computedPrefill: prefillValues,
          savedAnswers,
          computedFinalValues: finalValuesToSubmit,
          missing: missingRequired,
        },
      },
    });

    // 8) Return everything UI needs
    return NextResponse.json({
      ok: true,
      status,

      jobTitle: application.jobTitle,
      company: application.company,
      location: application.location ?? null,
      jobUrl: application.jobUrl,

      form: {
        action: form.action,
        method: form.method,
        hidden: form.hidden,
        fields: form.fields,
        debug: form.debug,
      },

      prefill: prefillValues,
      answers: savedAnswers,
      finalValuesToSubmit,
      missingRequired,

      meta: {
        missing: missingRequired,
        fieldStates,
      },

      auditItems,

      resume: resume
        ? {
            fileName: resume.fileName,
            mimeType: resume.mimeType,
          }
        : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}