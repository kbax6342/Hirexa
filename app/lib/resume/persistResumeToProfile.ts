import "server-only";

import crypto from "crypto";

import mammoth from "mammoth";
import OpenAI from "openai";
import { Prisma } from "@prisma/client";

import { deriveLocationLabel } from "@/app/lib/locationOptions";
import { extractPdfText } from "@/app/lib/pdf/serverPdfParser";
import { prisma } from "@/app/lib/prisma";
import {
  getSafePrivateProfileFields,
  readRawPrivateProfileFieldsByIds,
  sanitizePrivateProfileFields,
} from "@/app/lib/profile/privateProfileFields";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
type ChatCompletionRequest = Parameters<typeof openai.chat.completions.create>[0];

type RetryableError = {
  status?: number;
  requestID?: string;
  message?: string;
};

export type ParsedResumeExperience = {
  id: string;
  title: string;
  company: string;
  location?: string;
  dateRange?: string;
  bullets: string[];
};

type ResumeUploadInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  sizeBytes?: number | null;
};

type ResumePersonalInfo = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
};

type ProfileSyncSummary = {
  updatedFields: string[];
  skippedFields: string[];
};

export type PersistResumeToProfileResult = {
  resume: {
    id: string;
    userProfileId: string;
    fileName: string | null;
    filename: string | null;
    mimeType: string | null;
  };
  savedResume: {
    id: string;
    fileName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  } | null;
  extractedResumeText: string;
  parsedExperiences: ParsedResumeExperience[];
  profileSync: ProfileSyncSummary;
};

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status?: number) {
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function extractStatusAndRequestId(err: unknown): RetryableError {
  const anyErr = err as {
    status?: number;
    request_id?: string;
    requestID?: string;
    response?: { status?: number; headers?: { get?: (name: string) => string | null } };
    message?: string;
  };

  return {
    status: anyErr?.status ?? anyErr?.response?.status,
    requestID:
      anyErr?.request_id ??
      anyErr?.requestID ??
      anyErr?.response?.headers?.get?.("x-request-id") ??
      anyErr?.response?.headers?.get?.("request-id") ??
      undefined,
    message: anyErr?.message ?? String(err),
  };
}

async function withRetries<T>(
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number; label?: string }
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 5;
  const baseDelayMs = opts?.baseDelayMs ?? 400;
  const maxDelayMs = opts?.maxDelayMs ?? 4000;
  const label = opts?.label ?? "provider-call";

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const info = extractStatusAndRequestId(error);
      if (!isRetryableStatus(info.status) || attempt === maxAttempts) {
        throw error;
      }

      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = backoff + Math.floor(Math.random() * 200);

      console.warn(`[${label}] retrying after ${delay}ms`, {
        attempt,
        maxAttempts,
        status: info.status,
        requestID: info.requestID,
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

function cleanExtractedText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeResumeText(value: string) {
  return cleanExtractedText(value);
}

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeResumeMimeType(args: {
  mimeType: string | null;
  fileName: string;
}) {
  const normalizedMimeType = (args.mimeType ?? "").trim().toLowerCase();
  const normalizedFileName = args.fileName.trim().toLowerCase();

  if (normalizedMimeType.includes("pdf") || normalizedFileName.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (normalizedMimeType) {
    return normalizedMimeType;
  }

  if (normalizedFileName.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (normalizedFileName.endsWith(".doc")) {
    return "application/msword";
  }
  if (normalizedFileName.endsWith(".txt")) {
    return "text/plain";
  }

  return "application/octet-stream";
}

function readFirstWorkplaceLocation(value: unknown) {
  if (!Array.isArray(value)) return null;

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = trimOrNull(String((item as { label?: unknown }).label ?? ""));
    if (label) return label;
  }

  return null;
}

export async function extractResumeTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string
) {
  const normalizedMimeType = String(mimeType ?? "").toLowerCase();
  const normalizedFileName = String(fileName ?? "").toLowerCase();

  if (normalizedMimeType.includes("pdf") || normalizedFileName.endsWith(".pdf")) {
    const { fullText } = await extractPdfText(buffer);
    return cleanExtractedText(fullText);
  }

  if (
    normalizedMimeType.includes("officedocument.wordprocessingml.document") ||
    normalizedMimeType.includes("msword") ||
    normalizedFileName.endsWith(".docx") ||
    normalizedFileName.endsWith(".doc")
  ) {
    const parsed = await mammoth.extractRawText({ buffer });
    return cleanExtractedText(parsed.value || "");
  }

  if (normalizedMimeType.startsWith("text/") || normalizedFileName.endsWith(".txt")) {
    return cleanExtractedText(buffer.toString("utf-8"));
  }

  return "";
}

export async function extractResumeTextFromStoredFile(
  file:
    | {
        blob: Uint8Array;
        fileName: string;
        mimeType: string;
      }
    | null
    | undefined
) {
  if (!file?.blob) return "";

  return extractResumeTextFromBuffer(
    Buffer.from(file.blob),
    String(file.mimeType ?? "").toLowerCase(),
    String(file.fileName ?? "").toLowerCase()
  );
}

async function openaiExtractExperiences(fullText: string): Promise<ParsedResumeExperience[]> {
  const system = `
You are an expert resume parser.

Return ONLY valid JSON (no markdown, no commentary) with this exact shape:
{
  "experiences": [
    {
      "title": "string",
      "company": "string",
      "location": "string | null",
      "dateRange": "string | null",
      "bullets": ["string", ...]
    }
  ]
}

Rules:
- Extract all real work experience roles (jobs, internships, contracts).
- Do NOT include education, skills lists, summary paragraphs unless they are clearly a role.
- If location/dateRange missing, use null.
- bullets are responsibilities/accomplishments (can be empty).
`.trim();

  const user = `Resume text:\n"""${fullText.slice(0, 14000)}"""`;

  const response = await withRetries(
    async () =>
      openai.chat.completions.create({
        model: "gpt-4o-mini-2024-07-18",
        temperature: 0,
        max_tokens: 1800,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "experiences_schema",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["experiences"],
              properties: {
                experiences: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "company", "location", "dateRange", "bullets"],
                    properties: {
                      title: { type: "string" },
                      company: { type: "string" },
                      location: { type: ["string", "null"] },
                      dateRange: { type: ["string", "null"] },
                      bullets: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        } as ChatCompletionRequest["response_format"],
      }),
    { label: "openai.chat.completions.create", maxAttempts: 5 }
  );

  const raw = response.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error("OpenAI returned empty resume parsing output.");
  }

  const parsed = JSON.parse(raw) as {
    experiences?: Array<{
      title?: string;
      company?: string;
      location?: string | null;
      dateRange?: string | null;
      bullets?: string[];
    }>;
  };

  const experiences = Array.isArray(parsed.experiences) ? parsed.experiences : [];

  const normalizedExperiences: ParsedResumeExperience[] = [];

  for (const experience of experiences) {
    const title = trimOrNull(experience.title);
    const company = trimOrNull(experience.company);
    if (!title || !company) continue;

    normalizedExperiences.push({
      id: String(crypto.randomUUID()),
      title,
      company,
      location: trimOrNull(experience.location ?? null) ?? undefined,
      dateRange: trimOrNull(experience.dateRange ?? null) ?? undefined,
      bullets: Array.isArray(experience.bullets)
        ? experience.bullets
            .map((bullet) => trimOrNull(bullet))
            .filter((bullet): bullet is string => Boolean(bullet))
        : [],
    });
  }

  return normalizedExperiences;
}

function normalizeNamePart(value: string) {
  return value
    .toLowerCase()
    .split(/([-'])/)
    .map((part) =>
      part === "-" || part === "'"
        ? part
        : part
            ? `${part.charAt(0).toUpperCase()}${part.slice(1)}`
            : part
    )
    .join("");
}

function normalizeNameLine(value: string) {
  return value
    .split(/\s+/)
    .map((part) => normalizeNamePart(part))
    .join(" ");
}

function normalizePhoneDisplay(value: string) {
  const normalized = value
    .replace(/[^\d+().\-\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function normalizeUrlish(value?: string | null) {
  const trimmed = value?.trim().replace(/[),.;]+$/g, "");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(trimmed) && !trimmed.includes("@")) {
    return `https://${trimmed}`;
  }
  return null;
}

function extractNameFromResume(topLines: string[]) {
  const candidate = topLines.find((line) => {
    if (line.length < 3 || line.length > 60) return false;
    if (/@|https?:\/\/|www\.|\d|\|/.test(line)) return false;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) return false;
    return words.every((word) => /^[A-Za-z][A-Za-z.'-]*$/.test(word));
  });

  if (!candidate) return {};

  const normalized = normalizeNameLine(candidate);
  const parts = normalized.split(/\s+/);
  if (parts.length < 2) return {};

  return {
    firstName: normalizeNamePart(parts[0]),
    lastName: parts.slice(1).map((part) => normalizeNamePart(part)).join(" "),
  } satisfies ResumePersonalInfo;
}

function extractContactLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function extractPersonalInfoFromResumeText(text: string): ResumePersonalInfo {
  const normalizedText = normalizeResumeText(text);
  if (!normalizedText) return {};

  const topLines = extractContactLines(normalizedText);
  const emailMatch = normalizedText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = normalizedText.match(
    /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/
  );
  const linkedinMatch = normalizedText.match(
    /\b(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|)]+/i
  );

  const urlMatches = normalizedText.match(
    /\b(?:https?:\/\/|www\.)[^\s<>()|]+/gi
  ) ?? [];
  const portfolioMatch = urlMatches.find((url) => !/linkedin\.com/i.test(url));

  const addressIndex = topLines.findIndex(
    (line) =>
      /\d/.test(line) &&
      /\b(st|street|ave|avenue|road|rd|blvd|boulevard|drive|dr|lane|ln|court|ct|way|parkway|pkwy|apt|suite|ste)\b/i.test(
        line
      ) &&
      !/@/.test(line)
  );
  const address = addressIndex >= 0 ? topLines[addressIndex] : null;

  const statePattern = `${Object.keys(STATE_NAME_TO_CODE)
    .sort((left, right) => right.length - left.length)
    .map((state) => state.replace(/\s+/g, "\\s+"))
    .join("|")}|[A-Z]{2}`;
  const cityStatePostalRegex = new RegExp(
    `\\b([A-Za-z .'-]+),\\s*(${statePattern})\\s+(\\d{5}(?:-\\d{4})?)\\b`,
    "i"
  );

  let city: string | null = null;
  let state: string | null = null;
  let postalCode: string | null = null;

  const cityStateSource =
    (addressIndex >= 0 ? topLines[addressIndex + 1] : null) ??
    topLines.find((line) => cityStatePostalRegex.test(line)) ??
    null;
  const cityStateMatch = cityStateSource?.match(cityStatePostalRegex);
  if (cityStateMatch) {
    city = trimOrNull(cityStateMatch[1]) ?? null;
    const rawState = trimOrNull(cityStateMatch[2]) ?? null;
    if (rawState) {
      const normalizedState =
        rawState.length === 2
          ? rawState.toUpperCase()
          : STATE_NAME_TO_CODE[rawState.toLowerCase()] ?? rawState;
      state = normalizedState;
    }
    postalCode = trimOrNull(cityStateMatch[3]) ?? null;
  }

  return {
    ...extractNameFromResume(topLines),
    email: trimOrNull(emailMatch?.[0]?.toLowerCase() ?? null) ?? null,
    phone: phoneMatch ? normalizePhoneDisplay(phoneMatch[0]) : null,
    address: trimOrNull(address),
    city,
    state,
    postalCode,
    linkedinUrl: normalizeUrlish(linkedinMatch?.[0] ?? null),
    portfolioUrl: normalizeUrlish(portfolioMatch ?? null),
  };
}

function hasNonEmptyValue(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function pushSkipped(target: Set<string>, field: string, shouldTrack: boolean) {
  if (shouldTrack) {
    target.add(field);
  }
}

function buildProfileSyncUpdate(args: {
  profile: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    portfolioUrl: string | null;
    keyQuestions: Prisma.JsonValue | null;
    workplaceLocations: Prisma.JsonValue | null;
  };
  privateFields: ReturnType<typeof getSafePrivateProfileFields>;
  extractedInfo: ResumePersonalInfo;
  parsedExperiences: ParsedResumeExperience[];
}) {
  const updatedFields = new Set<string>();
  const skippedFields = new Set<string>();
  const profileUpdate: Prisma.UserProfileUpdateInput = {};
  const privateFieldInput: {
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  } = {};

  const setStringFieldIfMissing = (
    field: keyof Pick<
      Prisma.UserProfileUpdateInput,
      "firstName" | "lastName" | "email" | "phone" | "linkedinUrl" | "portfolioUrl"
    >,
    currentValue: string | null,
    nextValue: string | null | undefined,
    normalize?: (value: string) => string | null
  ) => {
    const normalizedNextValue = nextValue ? normalize?.(nextValue) ?? nextValue.trim() : null;
    if (!normalizedNextValue) return;

    if (hasNonEmptyValue(currentValue)) {
      pushSkipped(skippedFields, field, true);
      return;
    }

    profileUpdate[field] = normalizedNextValue;
    updatedFields.add(field);
  };

  setStringFieldIfMissing(
    "firstName",
    args.profile.firstName,
    args.extractedInfo.firstName,
    (value) => normalizeNamePart(value)
  );
  setStringFieldIfMissing(
    "lastName",
    args.profile.lastName,
    args.extractedInfo.lastName,
    (value) => normalizeNameLine(value)
  );
  setStringFieldIfMissing(
    "email",
    args.profile.email,
    args.extractedInfo.email,
    (value) => value.trim().toLowerCase()
  );
  setStringFieldIfMissing(
    "phone",
    args.profile.phone,
    args.extractedInfo.phone,
    (value) => normalizePhoneDisplay(value)
  );
  setStringFieldIfMissing(
    "linkedinUrl",
    args.profile.linkedinUrl,
    args.extractedInfo.linkedinUrl,
    (value) => normalizeUrlish(value)
  );
  setStringFieldIfMissing(
    "portfolioUrl",
    args.profile.portfolioUrl,
    args.extractedInfo.portfolioUrl,
    (value) => normalizeUrlish(value)
  );

  const maybeSetPrivateField = (
    field: keyof typeof privateFieldInput,
    currentValue: string | null,
    nextValue: string | null | undefined
  ) => {
    if (!nextValue?.trim()) return;

    if (hasNonEmptyValue(currentValue)) {
      pushSkipped(skippedFields, field, true);
      return;
    }

    privateFieldInput[field] = nextValue.trim();
  };

  maybeSetPrivateField("address", args.privateFields.address, args.extractedInfo.address);
  maybeSetPrivateField("city", args.privateFields.city, args.extractedInfo.city);
  maybeSetPrivateField("state", args.privateFields.state, args.extractedInfo.state);
  maybeSetPrivateField("postalCode", args.privateFields.postalCode, args.extractedInfo.postalCode);

  if (Object.keys(privateFieldInput).length > 0) {
    try {
      const sanitized = sanitizePrivateProfileFields(privateFieldInput);
      if (privateFieldInput.address && sanitized.address) {
        profileUpdate.address = sanitized.address;
        profileUpdate.addressEncrypted = sanitized.addressEncrypted;
        updatedFields.add("address");
      }
      if (privateFieldInput.city && sanitized.city) {
        profileUpdate.city = sanitized.city;
        profileUpdate.cityEncrypted = sanitized.cityEncrypted;
        profileUpdate.citySearch = sanitized.citySearch;
        updatedFields.add("city");
      }
      if (privateFieldInput.state && sanitized.state) {
        profileUpdate.state = sanitized.state;
        profileUpdate.stateEncrypted = sanitized.stateEncrypted;
        profileUpdate.stateSearch = sanitized.stateSearch;
        updatedFields.add("state");
      }
      if (privateFieldInput.postalCode && sanitized.postalCode) {
        profileUpdate.postalCode = sanitized.postalCode;
        profileUpdate.postalCodeEncrypted = sanitized.postalCodeEncrypted;
        profileUpdate.postalCodeSearch = sanitized.postalCodeSearch;
        updatedFields.add("postalCode");
      }
    } catch (error) {
      for (const field of Object.keys(privateFieldInput) as Array<keyof typeof privateFieldInput>) {
        pushSkipped(skippedFields, field, true);
      }
      console.warn("[resume persist] skipped private profile sync", {
        fields: Object.keys(privateFieldInput),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Target role is intentionally user-selected during onboarding or later
  // authenticated editing. Resume parsing can enrich profile fields, but it
  // must never infer or overwrite the feed-driving target role.

  const existingWorkplaceLocation = readFirstWorkplaceLocation(args.profile.workplaceLocations);
  const nextCity = privateFieldInput.city ?? args.privateFields.city ?? null;
  const nextState = privateFieldInput.state ?? args.privateFields.state ?? null;
  const derivedWorkplaceLocation =
    !existingWorkplaceLocation && nextCity && nextState
      ? deriveLocationLabel(nextCity, nextState)
      : null;

  if (!existingWorkplaceLocation && derivedWorkplaceLocation) {
    profileUpdate.workplaceLocations = [
      { label: derivedWorkplaceLocation },
    ] as Prisma.InputJsonValue;
    updatedFields.add("workplaceLocations");
  }

  return {
    profileUpdate,
    profileSync: {
      updatedFields: [...updatedFields],
      skippedFields: [...skippedFields],
    } satisfies ProfileSyncSummary,
  };
}

export async function persistResumeToProfile(args: {
  profileId: string;
  resumeFile?: ResumeUploadInput | null;
  resumeText?: string | null;
}) {
  const profile = await prisma.userProfile.findUnique({
    where: { id: args.profileId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      linkedinUrl: true,
      portfolioUrl: true,
      keyQuestions: true,
      workplaceLocations: true,
      address: true,
      addressEncrypted: true,
      city: true,
      cityEncrypted: true,
      citySearch: true,
      state: true,
      stateEncrypted: true,
      stateSearch: true,
      postalCode: true,
      postalCodeEncrypted: true,
      postalCodeSearch: true,
    },
  });

  if (!profile) {
    throw new Error("Profile not found for resume persistence.");
  }

  const fileName = trimOrNull(args.resumeFile?.fileName) ?? "pasted-resume.txt";
  const mimeType = normalizeResumeMimeType({
    mimeType: trimOrNull(args.resumeFile?.mimeType) ?? "text/plain",
    fileName,
  });

  let extractedResumeText = normalizeResumeText(args.resumeText ?? "");
  if (args.resumeFile) {
    extractedResumeText = await extractResumeTextFromBuffer(
      args.resumeFile.buffer,
      mimeType,
      fileName
    );
  }

  if (!extractedResumeText) {
    throw new Error("Resume text is empty.");
  }

  const parsedExperiences = await openaiExtractExperiences(extractedResumeText);
  const rawPrivateFieldsById = await readRawPrivateProfileFieldsByIds(prisma, [profile.id]);
  const privateFields = getSafePrivateProfileFields({
    ...(rawPrivateFieldsById.get(profile.id) ?? {}),
    ...profile,
  });
  const extractedInfo = extractPersonalInfoFromResumeText(extractedResumeText);
  const { profileUpdate, profileSync } = buildProfileSyncUpdate({
    profile,
    privateFields,
    extractedInfo,
    parsedExperiences,
  });

  const { resume, savedResume } = await prisma.$transaction(async (tx) => {
    const savedResumeRecord = await tx.resume.upsert({
      where: { userProfileId: profile.id },
      update: { filename: fileName, mimeType },
      create: { userProfileId: profile.id, filename: fileName, mimeType },
      select: { id: true, userProfileId: true, filename: true, mimeType: true },
    });

    const existingExperiences = await tx.experience.findMany({
      where: { resumeId: savedResumeRecord.id },
      select: { id: true },
    });

    if (existingExperiences.length > 0) {
      await tx.bullet.deleteMany({
        where: { experienceId: { in: existingExperiences.map((experience) => experience.id) } },
      });
    }

    await tx.experience.deleteMany({
      where: { resumeId: savedResumeRecord.id },
    });

    for (const [index, experience] of parsedExperiences.entries()) {
      const createdExperience = await tx.experience.create({
        data: {
          resumeId: savedResumeRecord.id,
          order: index,
          title: experience.title,
          company: experience.company,
          location: experience.location ?? null,
          dateRange: experience.dateRange ?? null,
        },
        select: { id: true },
      });

      if (experience.bullets.length > 0) {
        await tx.bullet.createMany({
          data: experience.bullets.map((text, bulletIndex) => ({
            experienceId: createdExperience.id,
            order: bulletIndex,
            text,
          })),
        });
      }
    }

    await tx.resumeExperience.upsert({
      where: { resumeId: savedResumeRecord.id },
      update: {
        experiences: parsedExperiences as unknown as Prisma.InputJsonValue,
      },
      create: {
        resumeId: savedResumeRecord.id,
        experiences: parsedExperiences as unknown as Prisma.InputJsonValue,
      },
    });

    let savedResumeFile: {
      id: string;
      fileName: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
    } | null = null;

    if (args.resumeFile) {
      const createdResumeFile = await tx.resumeFile.create({
        data: {
          profileId: profile.id,
          fileName,
          mimeType,
          sizeBytes: args.resumeFile.sizeBytes ?? args.resumeFile.buffer.byteLength,
          blob: Uint8Array.from(args.resumeFile.buffer),
        },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
        },
      });

      savedResumeFile = {
        id: createdResumeFile.id,
        fileName: createdResumeFile.fileName,
        mimeType: createdResumeFile.mimeType,
        sizeBytes: createdResumeFile.sizeBytes,
      };
    }

    if (Object.keys(profileUpdate).length > 0) {
      await tx.userProfile.update({
        where: { id: profile.id },
        data: profileUpdate,
      });
    }

    return {
      resume: savedResumeRecord,
      savedResume: savedResumeFile,
    };
  });

  return {
    resume: {
      id: resume.id,
      userProfileId: resume.userProfileId,
      fileName: resume.filename,
      filename: resume.filename,
      mimeType: resume.mimeType,
    },
    savedResume,
    extractedResumeText,
    parsedExperiences,
    profileSync,
  } satisfies PersistResumeToProfileResult;
}
