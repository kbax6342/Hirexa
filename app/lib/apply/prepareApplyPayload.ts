import { mapProfileToForm } from "@/app/lib/greenhouse/mapProfileToForm";
import {
  parseGreenhouseForm,
  type GhField,
} from "@/app/lib/greenhouse/parseGreenhouseForm";

type AnswerValue = string | string[];
export type AnswersMap = Record<string, AnswerValue>;

function isGreenhouseBoardUrl(jobUrl: string) {
  try {
    const host = new URL(jobUrl).hostname.toLowerCase();
    return (
      host === "job-boards.greenhouse.io" || host === "boards.greenhouse.io"
    );
  } catch {
    return false;
  }
}

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
  prefill: AnswerValue,
): AnswerValue {
  if (hasAnswer) return answer;
  if (field.type === "checkbox") return Array.isArray(prefill) ? prefill : [];
  return Array.isArray(prefill) ? (prefill[0] ?? "") : prefill;
}

function buildGenericPrefill(
  profile: Parameters<typeof mapProfileToForm>[1],
): AnswersMap {
  return {
    firstName: toText(profile.firstName),
    lastName: toText(profile.lastName),
    email: toText(profile.email),
    phone: toText(profile.phone),
    address: toText(profile.address),
    city: toText(profile.city),
    state: toText(profile.state),
    postalCode: toText(profile.postalCode),
    linkedin: toText(profile.linkedinUrl),
    website: toText(profile.portfolioUrl),
  };
}

export async function prepareApplyPayload(args: {
  jobUrl: string;
  profile: Parameters<typeof mapProfileToForm>[1];
  savedAnswers?: AnswersMap | null;
  requestAnswers?: AnswersMap | null;
}) {
  const answers: AnswersMap = {
    ...(args.savedAnswers ?? {}),
    ...(args.requestAnswers ?? {}),
  };
  let finalValuesToSubmit: AnswersMap = { ...answers };
  let greenhouseEmbedUrl: string | undefined;

  if (isGreenhouseBoardUrl(args.jobUrl)) {
    try {
      const form = await parseGreenhouseForm(args.jobUrl);
      greenhouseEmbedUrl = form.embedUrl;
      const { prefillValues } = mapProfileToForm(form.fields, args.profile);
      finalValuesToSubmit = {};

      for (const field of form.fields) {
        const hasAnswer = Object.prototype.hasOwnProperty.call(
          answers,
          field.name,
        );
        const answerValue = normalizeAnswer(answers[field.name], field);
        const prefillValue = normalizeAnswer(prefillValues[field.name], field);
        finalValuesToSubmit[field.name] = mergeValue(
          field,
          answerValue,
          hasAnswer,
          prefillValue,
        );
      }
    } catch (error) {
      console.log(
        "[REMOTE_APPLY] greenhouse parse failed, using merged answers",
        {
          reason: error instanceof Error ? error.message : String(error),
        },
      );
    }
  } else {
    finalValuesToSubmit = {
      ...buildGenericPrefill(args.profile),
      ...answers,
    };
  }

  return { answers, finalValuesToSubmit, greenhouseEmbedUrl };
}
