import "server-only";

import OpenAI from "openai";

import { getWorkStoryOptionsForRole } from "@/app/lib/onboarding/workStoryOptions";

const MAX_WORK_STORY_OPTIONS = 4;

let openAIClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openAIClient) {
    openAIClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return openAIClient;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function getFallbackOptions(role: string | null | undefined) {
  return getWorkStoryOptionsForRole(role)
    .filter((option) => option !== "Other")
    .slice(0, MAX_WORK_STORY_OPTIONS);
}

function shouldUseCuratedRoleOptions(role: string) {
  return /(medical sonographer|diagnostic medical sonographer|sonographer|ultrasound tech|ultrasound technician|ultrasonographer)/i.test(
    role
  );
}

function normalizeGeneratedOptions(value: unknown, fallbackOptions: string[]) {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of items) {
    const text = normalizeText(item);
    if (!text || text.toLowerCase() === "other") continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);

    if (normalized.length >= MAX_WORK_STORY_OPTIONS) {
      break;
    }
  }

  if (normalized.length === MAX_WORK_STORY_OPTIONS) {
    return normalized;
  }

  for (const fallback of fallbackOptions) {
    const key = fallback.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(fallback);

    if (normalized.length >= MAX_WORK_STORY_OPTIONS) {
      break;
    }
  }

  return normalized.slice(0, MAX_WORK_STORY_OPTIONS);
}

export async function generateWorkStoryOptionsForRole(
  role: string | null | undefined
) {
  const normalizedRole = normalizeText(role);
  const fallbackOptions = getFallbackOptions(normalizedRole);
  const client = getOpenAIClient();

  if (!normalizedRole || !client || shouldUseCuratedRoleOptions(normalizedRole)) {
    return {
      options: fallbackOptions,
      source: "fallback" as const,
    };
  }

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0.9,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You generate onboarding option labels for a job-seeker experience. Return strict JSON only in the shape {\"options\":[\"...\",\"...\",\"...\",\"...\"]}. Each option must be a short description of real tasks or responsibilities someone in the target role would have done before. Use 2 to 6 words per option. Avoid generic soft skills, avoid first-person phrasing, avoid numbering, and do not include explanations.",
        },
        {
          role: "user",
          content: `Target role: ${normalizedRole}\nReturn exactly 4 distinct work-history option labels for this role.`,
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(rawContent) as { options?: unknown };

    return {
      options: normalizeGeneratedOptions(parsed.options, fallbackOptions),
      source: "openai" as const,
    };
  } catch {
    return {
      options: fallbackOptions,
      source: "fallback" as const,
    };
  }
}
