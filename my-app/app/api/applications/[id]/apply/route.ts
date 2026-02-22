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

function detectGreenhouseSuccess(html: string, finalUrl?: string | null) {
  const normalized = html.replace(/\s+/g, " ").toLowerCase();

  const successSignals = [/thank you/i, /application submitted/i, /we have received/i];
  const errorSignals = [
    /there was a problem/i,
    /please fill out/i,
    /required/i,
    /validation/i,
    /error/i,
    /captcha/i,
    /sign in/i,
    /log in/i,
  ];

  const hasSuccessText = successSignals.some((re) => re.test(normalized));
  const hasErrorText = errorSignals.some((re) => re.test(normalized));

  const urlLooksLikeThankYou = finalUrl
    ? /thank[_-]?you|submitted|application_confirmation|confirmation/i.test(finalUrl)
    : false;

  return {
    ok: (hasSuccessText || urlLooksLikeThankYou) && !hasErrorText,
    hasSuccessText,
    hasErrorText,
    urlLooksLikeThankYou,
  };
}

function shortExcerpt(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280);
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    }

    if (!application.jobUrl) {
      return NextResponse.json({ ok: false, error: "Application missing jobUrl" }, { status: 400 });
    }

    const form = await parseGreenhouseForm(application.jobUrl);
    const { prefillValues } = mapProfileToForm(form.fields, application.userProfile);

    const savedAnswers = (application.answersJson as AnswersMap | null) ?? {};
    const answers: AnswersMap = { ...savedAnswers, ...requestAnswers };

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

    const auditSnapshot = {
      form: {
        action: form.action,
        method: form.method,
        hidden: form.hidden,
        fields: form.fields,
      },
      computedPrefill: prefillValues,
      computedFinalValues: finalValuesToSubmit,
      missing: missingRequired,
    };

    if (missingRequired.length > 0) {
      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "IN_PREPARATION",
          answersJson: answers,
          auditJson: auditSnapshot,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Please complete all required fields before applying.",
          missingRequired,
        },
        { status: 400 }
      );
    }

    const fd = new FormData();
    Object.entries(form.hidden).forEach(([key, value]) => {
      fd.append(key, String(value));
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
    const successCheck = detectGreenhouseSuccess(responseHtml, submitRes.url);

    if (!submitRes.ok || !successCheck.ok) {
      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "READY_TO_SEND",
          answersJson: answers,
          auditJson: {
            ...auditSnapshot,
            greenhouseResponse: {
              statusCode: submitRes.status,
              finalUrl: submitRes.url,
              excerpt: shortExcerpt(responseHtml),
              successSignals: successCheck,
            },
          },
        },
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Greenhouse did not confirm submission",
          statusCode: submitRes.status,
          reason: shortExcerpt(responseHtml),
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
          ...auditSnapshot,
          greenhouseResponse: {
            statusCode: submitRes.status,
            finalUrl: submitRes.url,
            excerpt: shortExcerpt(responseHtml),
            successSignals: successCheck,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      status: "SENT",
      confirmation: "Confirmed: Greenhouse submission successful",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
