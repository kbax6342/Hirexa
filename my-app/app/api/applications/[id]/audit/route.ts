import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { mapProfileToForm } from "@/app/lib/greenhouse/mapProfileToForm";
import { parseGreenhouseForm, type GhField, type GhParsedForm } from "@/app/lib/greenhouse/parseGreenhouseForm";
import { detectCountryFieldKind } from "@/app/lib/greenhouse/countryFields";

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

    let form: GhParsedForm;
    try {
      form = await parseGreenhouseForm(application.jobUrl);
      console.log("GH parse debug:", form.debug);
    } catch (parseError: unknown) {
      const message = parseError instanceof Error ? parseError.message : "Unable to parse Greenhouse form";
      console.error(message);

      let parsedDebug: unknown;
      if (message.includes("DEBUG=")) {
        const debugRaw = message.slice(message.indexOf("DEBUG=") + "DEBUG=".length);
        try {
          parsedDebug = JSON.parse(debugRaw);
          console.log("GH PARSE DEBUG OBJECT:", parsedDebug);
        } catch {
          parsedDebug = { parseError: "Failed to parse DEBUG payload", raw: debugRaw };
        }
      }

      return NextResponse.json(
        {
          ok: false,
          error: "No application form found...",
          ...(parsedDebug ? { debug: parsedDebug } : {}),
          jobTitle: application.jobTitle,
          company: application.company,
          location: application.location ?? null,
          meta: { fieldStates: [] },
        },
        { status: 200 }
      );
    }

    const mapped = mapProfileToForm(form.fields, application.userProfile);
    const prefillValues = mapped.prefillValues ?? {};
    const auditItems: Array<unknown> = [];

    const savedAnswers = ((application.answersJson as AnswersMap | null) ?? {}) as AnswersMap;

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

    console.log("GH fields count:", form.fields.length, "method:", form.method, "action:", form.action);

    const fieldStates = form.fields.map((f) => {
      const v = finalValuesToSubmit[f.name];
      const has = Object.prototype.hasOwnProperty.call(savedAnswers, f.name);

      const countryFieldKind = detectCountryFieldKind(f);

      return {
        path: f.name,
        label: f.label,
        placeholder: f.placeholder ?? "",
        type: f.type,
        required: f.required,
        options: Array.isArray(f.options) ? f.options : [],
        value: v,
        isMissing: missingRequired.includes(f.name),
        rawValue: prefillValues[f.name],
        submittedValue: has ? savedAnswers[f.name] : undefined,
        countryFieldKind,
        isCountryField: countryFieldKind !== null,
      };
    });

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

    const actionSuspicious = Boolean(form.debug?.actionSuspicious);

    return NextResponse.json({
      ok: true,
      status,
      ...(actionSuspicious ? { warning: "Parsed submit action looks suspicious, but fields were extracted." } : {}),

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
        actionSuspicious,
        action: form.action,
        method: form.method,
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
