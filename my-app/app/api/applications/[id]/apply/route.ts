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

function sanitizeSnippet(text: string, maxLen = 300) {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLen);
}

function detectGreenhouseOutcome(html: string, finalUrl?: string | null) {
  const normalizedText = sanitizeSnippet(html, 5000);
  const successByUrl = finalUrl
    ? /\/thank_you|thank_you|thanks|submitted|confirmation/i.test(finalUrl)
    : false;

  const successPatterns = [
    /thank you/i,
    /application submitted/i,
    /we (?:have|['’]ve) received/i,
    /your application has been received/i,
    /thanks for applying/i,
  ];
  const successByHtml = successPatterns.some((re) => re.test(normalizedText));

  const hasGenericErrorText =
    /error/i.test(normalizedText) && /(required|missing|please|fix the errors)/i.test(normalizedText);
  const errorPatterns = [
    /this field is required/i,
    /please fill out/i,
    /there was a problem/i,
    /something went wrong/i,
    /class=["'][^"']*(?:error|field_with_errors|errors|error_messages)[^"']*["']/i,
  ];
  const hasErrorIndicators = hasGenericErrorText || errorPatterns.some((re) => re.test(html));
  const hasCaptchaIndicators = /captcha|turnstile|cloudflare/i.test(normalizedText);

  const reasonCandidates = [
    /<(?:div|p|span|li)[^>]*class=["'][^"']*(?:error_messages|field_with_errors|errors|error)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p|span|li)>/i,
    /<(?:div|p|span)[^>]*aria-live=["'][^"']+["'][^>]*>([\s\S]*?)<\/(?:div|p|span)>/i,
    /(this field is required[^<\n\r]{0,160})/i,
    /(please fill out[^<\n\r]{0,160})/i,
    /(there was a problem[^<\n\r]{0,160})/i,
    /(something went wrong[^<\n\r]{0,160})/i,
    /(captcha[^<\n\r]{0,160})/i,
    /(turnstile[^<\n\r]{0,160})/i,
    /(cloudflare[^<\n\r]{0,160})/i,
  ];

  let reason = "";
  for (const re of reasonCandidates) {
    const match = re.exec(html);
    if (match?.[1]) {
      reason = sanitizeSnippet(match[1], 200);
      if (reason) break;
    }
  }
  if (!reason) reason = sanitizeSnippet(html, 200);

  const hints: string[] = [];
  if (hasCaptchaIndicators) {
    hints.push("Greenhouse likely requires captcha/Turnstile/Cloudflare verification that cannot be solved server-side.");
  }
  if (/this field is required|please fill out|required|missing|fix the errors/i.test(normalizedText)) {
    hints.push("A required field appears to be missing or invalid; verify all required answers and consent checkboxes.");
  }
  if (/field_with_errors|error_messages|class=["'][^"']*errors?/i.test(html)) {
    hints.push("Greenhouse returned inline field validation errors; inspect the highlighted fields in the form.");
  }
  if (!successByUrl && !successByHtml) {
    hints.push("No thank-you confirmation detected in response URL/body; Greenhouse may require JS-only interactions.");
  }

  return {
    ok: successByUrl || successByHtml,
    successByUrl,
    successByHtml,
    hasErrorIndicators,
    hasCaptchaIndicators,
    reason,
    hints,
    errorSnippet: sanitizeSnippet(html, 220),
  };
}

function shortExcerpt(html: string) {
  return sanitizeSnippet(html, 280);
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

    const method = String(form.method || "").trim().toUpperCase();
    if (method === "GET") {
      return NextResponse.json(
        {
          ok: false,
          error: "Parsed form method was GET; not a submit form",
          statusCode: 400,
          finalUrl: form.action,
          reason: "Greenhouse parser resolved a GET form instead of the submission POST form.",
          hints: ["Refresh form parsing and ensure the apply/submit form is selected."],
        },
        { status: 400 }
      );
    }

    if (/\/jobs\/\d+/i.test(form.action)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Parsed form action looked like a job page, not a submit endpoint",
          statusCode: 400,
          finalUrl: form.action,
          reason: "Parsed action appears suspicious and may not be the Greenhouse submission endpoint.",
          hints: ["Expected a Greenhouse form post URL, but got a jobs page URL."],
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
    const successCheck = detectGreenhouseOutcome(responseHtml, submitRes.url);

    console.info("[apply] greenhouse submission response", {
      statusCode: submitRes.status,
      finalUrl: submitRes.url,
      responseSnippet: sanitizeSnippet(responseHtml, 300),
      flags: {
        successByUrl: successCheck.successByUrl,
        successByHtml: successCheck.successByHtml,
        hasErrorIndicators: successCheck.hasErrorIndicators,
        hasCaptchaIndicators: successCheck.hasCaptchaIndicators,
      },
    });

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
          finalUrl: submitRes.url,
          reason: successCheck.reason,
          hints: successCheck.hints,
          errorSnippet: successCheck.errorSnippet,
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
