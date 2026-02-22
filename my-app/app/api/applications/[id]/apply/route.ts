// my-app/app/api/applications/[id]/apply/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { mapProfileToForm } from "@/app/lib/greenhouse/mapProfileToForm";
import { parseGreenhouseForm, type GhField } from "@/app/lib/greenhouse/parseGreenhouseForm";

export const runtime = "nodejs";

type AnswerValue = string | string[];
type AnswersMap = Record<string, AnswerValue>;

type ApplyBody = {
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

function pickResumeFieldName(fields: GhField[]) {
  const fileFields = fields.filter((field) => field.type === "file");
  if (!fileFields.length) return null;

  const namedResume = fileFields.find((field) => {
    const text = `${field.name} ${field.label}`.toLowerCase();
    return text.includes("resume") || text.includes("cv");
  });

  return namedResume?.name ?? fileFields[0].name;
}

function isSuccessHtml(html: string) {
  return /thank you|application submitted|we have received/i.test(html);
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
    const requestAnswers = body.answers ?? {};

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

    const savedAnswers = (application.answersJson as AnswersMap | null) ?? {};
    const answers: AnswersMap = { ...savedAnswers, ...requestAnswers };

    await prisma.jobApplication.update({
      where: { id: application.id },
      data: { status: "IN_PROGRESS" },
    });

    const form = await parseGreenhouseForm(application.jobUrl);
    const { prefillValues } = mapProfileToForm(form.fields, application.userProfile);

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
      const hasAnswer = Object.prototype.hasOwnProperty.call(answers, field.name);
      const answerValue = normalizeAnswer(answers[field.name], field);
      const prefillValue = normalizeAnswer(prefillValues[field.name], field);
      const finalValue = mergeValue(field, answerValue, hasAnswer, prefillValue);

      finalValuesToSubmit[field.name] = finalValue;

      if (field.required) {
        if (field.type === "file") {
          if (!resume) missingRequired.push(field.name);
        } else if (Array.isArray(finalValue)) {
          if (finalValue.length === 0) missingRequired.push(field.name);
        } else if (!finalValue) {
          missingRequired.push(field.name);
        }
      }
    }

    if (missingRequired.length > 0) {
      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "IN_PREPARATION",
          answersJson: answers,
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

      return NextResponse.json(
        {
          error: "Please complete all required fields before applying.",
          missingRequired,
        },
        { status: 400 }
      );
    }

    const fd = new FormData();
    Object.entries(form.hidden).forEach(([key, value]) => {
      fd.set(key, String(value));
    });

    for (const field of form.fields) {
      if (field.type === "file") continue;
      const value = finalValuesToSubmit[field.name];
      if (Array.isArray(value)) {
        value.forEach((item) => fd.append(field.name, item));
      } else {
        fd.set(field.name, value ?? "");
      }
    }

    const resumeFieldName = pickResumeFieldName(form.fields);
    if (resume && resumeFieldName) {
      fd.set(
        resumeFieldName,
        new Blob([resume.blob], { type: "application/pdf" }),
        resume.fileName || "resume.pdf"
      );
    }

    const submitRes = await fetch(form.action, {
      method: "POST",
      body: fd,
      redirect: "follow",
    });

    const responseHtml = await submitRes.text();
    const success = submitRes.ok && isSuccessHtml(responseHtml);

    if (!success) {
      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "READY_TO_SEND",
          answersJson: answers,
          auditJson: {
            form: {
              action: form.action,
              method: form.method,
              hidden: form.hidden,
              fields: form.fields,
            },
            computedPrefill: prefillValues,
            computedFinalValues: finalValuesToSubmit,
            missing: [],
          },
        },
      });

      return NextResponse.json(
        {
          error: "Greenhouse did not confirm submission.",
          statusCode: submitRes.status,
        },
        { status: 502 }
      );
    }

    // ✅ NEW: Save country + countryCode back to profile (simple heuristic)
    let country: string | null = null;
    let countryCode: string | null = null;

    for (const field of form.fields) {
      const name = String(field.name ?? "").toLowerCase();
      const value = finalValuesToSubmit[field.name];

      if (!value) continue;

      if (name.includes("country") && !name.includes("phone")) {
        country = Array.isArray(value) ? (value[0] ?? null) : value;
      }

      if (name.includes("country_code") || name.includes("phone_country")) {
        countryCode = Array.isArray(value) ? (value[0] ?? null) : value;
      }
    }

    await prisma.jobApplication.update({
      where: { id: application.id },
      data: {
        status: "SENT",
        submittedAt: new Date(),
        answersJson: answers,
        auditJson: {
          form: {
            action: form.action,
            method: form.method,
            hidden: form.hidden,
            fields: form.fields,
          },
          computedPrefill: prefillValues,
          computedFinalValues: finalValuesToSubmit,
          missing: [],
        },
      },
    });

    // Save back to profile (only if we found values)
    if (country || countryCode) {
      await prisma.userProfile.update({
        where: { id: application.userProfileId },
        data: {
          ...(country ? { country } : {}),
          ...(countryCode ? { countryCode } : {}),
        },
      });
    }

    return NextResponse.json({ ok: true, status: "SENT" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}