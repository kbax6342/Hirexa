import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import OpenAI from "openai";
import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import {
  HIREPILOT_SESSION_COOKIE,
  getHirePilotBillingStatus,
} from "@/app/lib/hirepilot/checkHirePilotAccess";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

type RewriteMode = "default" | "shorten" | "expand" | "professional";

type HirePilotRequest = {
  question?: string;
  mode?: RewriteMode;
  currentAnswer?: string | null;
  practiceMode?: boolean;
};

const hirePilotProfileSelect = {
  firstName: true,
  lastName: true,
  city: true,
  state: true,
  country: true,
  skills: true,
  resumeSkills: true,
  keyQuestions: true,
  jobInterests: {
    orderBy: { id: "asc" },
    take: 5,
    select: {
      title: true,
    },
  },
  resume: {
    select: {
      filename: true,
      experiences: {
        orderBy: { order: "asc" },
        take: 6,
        select: {
          title: true,
          company: true,
          location: true,
          dateRange: true,
          bullets: {
            orderBy: { order: "asc" },
            take: 4,
            select: {
              text: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserProfileSelect;

type HirePilotProfile = Prisma.UserProfileGetPayload<{
  select: typeof hirePilotProfileSelect;
}>;

function trimText(value: unknown) {
  return String(value ?? "").trim();
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = trimText(value);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function getRoleFocus(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const roleFocus = (value as Record<string, unknown>).roleFocus;
  return typeof roleFocus === "string" ? trimText(roleFocus) || null : null;
}

function normalizeQuestion(question: string) {
  return question.replace(/\s+/g, " ").trim();
}

function buildTips(question: string) {
  const normalized = question.toLowerCase();

  if (normalized.includes("tell me about yourself")) {
    return [
      "Use a present-past-future structure to keep your answer focused.",
      "Lead with your current strengths before moving into relevant background.",
      "End by connecting your story to the role you want next.",
    ];
  }

  if (
    normalized.includes("example") ||
    normalized.includes("time when") ||
    normalized.includes("challenge") ||
    normalized.includes("conflict")
  ) {
    return [
      "Use STAR: Situation, Task, Action, Result.",
      "Spend most of your time on the actions you personally took.",
      "Close with a measurable or concrete result whenever possible.",
    ];
  }

  if (normalized.includes("strength")) {
    return [
      "Name the strength clearly first.",
      "Support it with one specific example from your experience.",
      "Tie the strength back to the responsibilities of the role.",
    ];
  }

  if (normalized.includes("why") || normalized.includes("interested")) {
    return [
      "Connect your experience to what the company or role needs.",
      "Show enthusiasm, but keep it grounded in real evidence from your background.",
      "Mention the specific impact you want to make in the role.",
    ];
  }

  return [
    "Keep the answer focused on one or two clear themes.",
    "Use specific examples instead of broad claims whenever possible.",
    "End by tying your answer back to the value you would bring to the role.",
  ];
}

function buildFallbackAnswer(params: {
  question: string;
  mode: RewriteMode;
  currentAnswer: string;
  fullName: string | null;
  roleFocus: string | null;
  selectedTitles: string[];
  skills: string[];
  experiences: Array<{
    title: string;
    company: string;
    location: string | null;
    dateRange: string | null;
    bullets: string[];
  }>;
}) {
  const { question, mode, currentAnswer, fullName, roleFocus, selectedTitles, skills, experiences } =
    params;

  const recentExperience = experiences[0] ?? null;
  const recentTitle = recentExperience?.title || roleFocus || selectedTitles[0] || "professional";
  const recentCompany = recentExperience?.company || null;
  const skillSummary = skills.slice(0, 4).join(", ");
  const opener = fullName ? `I am ${fullName}` : `I am a ${recentTitle}`;

  if (mode !== "default" && currentAnswer) {
    if (mode === "shorten") {
      return currentAnswer
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join(" ");
    }

    if (mode === "expand") {
      return `${currentAnswer} I focus on staying adaptable, communicating clearly with stakeholders, and learning quickly so I can contribute faster in new environments.`;
    }

    if (mode === "professional") {
      return `Certainly. ${currentAnswer}`.replace(/\bi'm\b/gi, "I am");
    }
  }

  const normalizedQuestion = question.toLowerCase();

  if (normalizedQuestion.includes("tell me about yourself")) {
    return [
      `${opener} with experience in ${recentTitle}${recentCompany ? ` at ${recentCompany}` : ""}.`,
      skillSummary
        ? `A lot of my work has centered on ${skillSummary}, and I enjoy turning that experience into practical results.`
        : `My background has helped me build strong problem-solving, communication, and execution skills.`,
      "What I am looking for next is an opportunity where I can bring that foundation into a team, continue growing, and make an immediate impact.",
    ].join(" ");
  }

  if (normalizedQuestion.includes("strength")) {
    return [
      `One of my biggest strengths is my ability to stay effective in ${recentTitle} work while keeping communication clear and execution organized.`,
      skillSummary
        ? `I pair that with practical skills in ${skillSummary}, which helps me contribute across both day-to-day execution and longer-term priorities.`
        : `That helps me contribute across both day-to-day execution and longer-term priorities.`,
      "I try to make sure that my work is not just completed, but completed in a way that supports the broader goals of the team.",
    ].join(" ");
  }

  if (normalizedQuestion.includes("why")) {
    return [
      `What stands out to me about this opportunity is the chance to apply my background in ${recentTitle} work to a role where I can keep growing and contribute quickly.`,
      recentCompany
        ? `I have already built experience in that kind of environment through my work at ${recentCompany}, and I am motivated to bring that perspective into a new team.`
        : "I am motivated by roles where I can combine strong execution, adaptability, and consistent follow-through.",
      "I am especially interested in opportunities where I can add value early while continuing to deepen my expertise.",
    ].join(" ");
  }

  return [
    `My background in ${recentTitle} work has prepared me well for questions like this because it has required strong communication, adaptability, and ownership.`,
    skillSummary
      ? `I would answer by grounding my response in the work I have done around ${skillSummary} and the impact I have tried to create.`
      : "I would answer by grounding my response in specific examples from my experience and the impact I have tried to create.",
    "The main point I would want to communicate is that I can step in, learn quickly, and contribute in a thoughtful, reliable way.",
  ].join(" ");
}

function buildContextSummary(profile: HirePilotProfile | null) {
  const fullName = dedupeStrings([
    trimText(profile?.firstName),
    trimText(profile?.lastName),
  ]).join(" ");

  const roleFocus = getRoleFocus(profile?.keyQuestions);
  const selectedTitles = dedupeStrings(
    (profile?.jobInterests ?? []).map((item) => trimText(item.title))
  );
  const skills = dedupeStrings([...(profile?.skills ?? []), ...(profile?.resumeSkills ?? [])]).slice(
    0,
    16
  );

  const experiences = (profile?.resume?.experiences ?? []).map((experience) => ({
    title: trimText(experience.title) || "Unknown title",
    company: trimText(experience.company) || "Unknown company",
    location: trimText(experience.location) || null,
    dateRange: trimText(experience.dateRange) || null,
    bullets: experience.bullets.map((bullet) => trimText(bullet.text)).filter(Boolean),
  }));

  const location = dedupeStrings([
    trimText(profile?.city),
    trimText(profile?.state),
    trimText(profile?.country),
  ]).join(", ");

  const userProfileText = [
    fullName ? `Name: ${fullName}` : null,
    location ? `Location: ${location}` : null,
    roleFocus ? `Role focus: ${roleFocus}` : null,
    selectedTitles.length ? `Onboarding job titles: ${selectedTitles.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const resumeText = profile?.resume
    ? [
        `Resume file: ${trimText(profile.resume.filename) || "Uploaded resume"}`,
        ...experiences.map((experience) =>
          `${experience.title} at ${experience.company}${
            experience.dateRange ? ` (${experience.dateRange})` : ""
          }`
        ),
      ].join("\n")
    : "No uploaded resume available.";

  const experienceText = experiences.length
    ? experiences
        .map((experience) =>
          [
            `${experience.title} | ${experience.company}`,
            experience.location ? `Location: ${experience.location}` : null,
            experience.dateRange ? `Dates: ${experience.dateRange}` : null,
            experience.bullets.length
              ? `Highlights: ${experience.bullets.slice(0, 3).join(" | ")}`
              : null,
          ]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n\n")
    : "No parsed work experience available.";

  const skillsText = skills.length ? skills.join(", ") : "No saved skills available.";

  return {
    fullName: fullName || null,
    roleFocus,
    selectedTitles,
    skills,
    experiences,
    userProfileText: userProfileText || "No additional user profile details available.",
    resumeText,
    experienceText,
    skillsText,
  };
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(HIREPILOT_SESSION_COOKIE)?.value ?? null;
    const body = (await req.json()) as HirePilotRequest;
    const practiceMode = Boolean(body.practiceMode);

    if (!practiceMode && !sessionCookie) {
      const status = await getHirePilotBillingStatus(userId);
      return NextResponse.json(
        {
          ok: false,
          error: "HirePilot access required",
          hirePilotUnlimited: status.hirePilotUnlimited,
          hirePilotCredits: status.hirePilotCredits,
        },
        { status: 403 }
      );
    }

    const activeUsage =
      !practiceMode && sessionCookie
        ? await prisma.hirePilotUsage.findFirst({
            where: {
              id: sessionCookie,
              userId,
            },
            select: { id: true },
          })
        : null;

    if (!practiceMode && !activeUsage) {
      const status = await getHirePilotBillingStatus(userId);
      return NextResponse.json(
        {
          ok: false,
          error: "HirePilot access required",
          hirePilotUnlimited: status.hirePilotUnlimited,
          hirePilotCredits: status.hirePilotCredits,
        },
        { status: 403 }
      );
    }

    const question = normalizeQuestion(trimText(body.question).slice(0, 500));
    const mode: RewriteMode =
      body.mode === "shorten" ||
      body.mode === "expand" ||
      body.mode === "professional"
        ? body.mode
        : "default";
    const currentAnswer = trimText(body.currentAnswer);

    if (!question) {
      return NextResponse.json(
        { ok: false, error: "An interview question is required." },
        { status: 400 }
      );
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: hirePilotProfileSelect,
    });

    if (practiceMode && !profile?.resume) {
      return NextResponse.json(
        {
          ok: false,
          error: "Please upload your resume to use practice questions.",
        },
        { status: 400 }
      );
    }

    const context = buildContextSummary(profile);
    const fallbackTips = buildTips(question);

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        ok: true,
        answer: buildFallbackAnswer({
          question,
          mode,
          currentAnswer,
          fullName: context.fullName,
          roleFocus: context.roleFocus,
          selectedTitles: context.selectedTitles,
          skills: context.skills,
          experiences: context.experiences,
        }),
        tips: fallbackTips,
        source: "fallback",
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const modeInstruction =
      mode === "shorten"
        ? "Rewrite the answer to be concise and interview-ready in 3 to 5 sentences."
        : mode === "expand"
        ? "Expand the answer with more useful detail while keeping it natural and truthful."
        : mode === "professional"
        ? "Rewrite the answer in a more polished, executive, and professional tone."
        : "Generate a strong professional interview answer in first person.";

    const prompt = [
      "User profile:",
      context.userProfileText,
      "",
      "User resume:",
      context.resumeText,
      "",
      "User experience:",
      context.experienceText,
      "",
      "User skills:",
      context.skillsText,
      "",
      `Interview question: ${question}`,
      "",
      mode !== "default" && currentAnswer
        ? `Current answer draft: ${currentAnswer}`
        : "No existing answer draft yet.",
      "",
      `Instruction: ${modeInstruction}`,
      "",
      "Return strict JSON with keys: answer (string) and tips (array of up to 3 strings).",
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: mode === "default" ? 0.4 : 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are HirePilot, a real-time interview assistant. Write polished, first-person interview answers grounded strictly in the provided user context. Do not invent companies, metrics, dates, or achievements that are not supported by the context. If the context is thin, keep the answer adaptable and honest. Return only valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { answer?: string; tips?: string[] } = {};

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const answer =
      trimText(parsed.answer) ||
      buildFallbackAnswer({
        question,
        mode,
        currentAnswer,
        fullName: context.fullName,
        roleFocus: context.roleFocus,
        selectedTitles: context.selectedTitles,
        skills: context.skills,
        experiences: context.experiences,
      });

    const tips = Array.isArray(parsed.tips)
      ? dedupeStrings(parsed.tips.map((tip) => trimText(tip))).slice(0, 3)
      : [];

    return NextResponse.json({
      ok: true,
      answer,
      tips: tips.length > 0 ? tips : fallbackTips,
      source: "openai",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to generate interview answer.",
      },
      { status: 500 }
    );
  }
}
