import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { getHirexaAccessForUser } from "@/app/lib/billing/getHirexaAccess";

export const runtime = "nodejs";

type CareerCoachRequest = {
  targetRoles?: string;
  targetIndustry?: string;
  preferredLocation?: string;
  experienceLevel?: string;
  biggestChallenge?: string;
  priority?: string;
  additionalContext?: string;
};

type CareerCoachPlan = {
  summary: string;
  whyThisAdvice: string;
  actionPlan: string[];
  nextMoves: string[];
  resumeAdvice: string[];
  interviewTalkingPoints: string[];
  outreachAdvice: string[];
  skillsToBuild: string[];
  risks: string[];
  quickWins: string[];
};

type CareerCoachPlanListKey =
  | "actionPlan"
  | "nextMoves"
  | "resumeAdvice"
  | "interviewTalkingPoints"
  | "outreachAdvice"
  | "skillsToBuild"
  | "risks"
  | "quickWins";

const careerCoachProfileSelect = {
  firstName: true,
  lastName: true,
  city: true,
  state: true,
  country: true,
  workplaceLocations: true,
  keyQuestions: true,
  skills: true,
  resumeSkills: true,
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
            take: 3,
            select: {
              text: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserProfileSelect;

type CareerCoachProfile = Prisma.UserProfileGetPayload<{
  select: typeof careerCoachProfileSelect;
}>;

type CareerCoachContext = {
  fullName: string | null;
  roleFocus: string | null;
  location: string | null;
  savedTitles: string[];
  skills: string[];
  resumeAvailable: boolean;
  experienceCount: number;
  experiences: Array<{
    title: string;
    company: string;
    location: string | null;
    dateRange: string | null;
    bullets: string[];
  }>;
};

function trimText(value: unknown, maxLength = 300) {
  return String(value ?? "").trim().slice(0, maxLength);
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

function readRoleFocus(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const roleFocus = trimText((value as { roleFocus?: string | null }).roleFocus);
  return roleFocus || null;
}

function readWorkplaceLocation(value: unknown) {
  if (!Array.isArray(value)) return null;

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = trimText((item as { label?: string | null }).label);
    if (label) return label;
  }

  return null;
}

function normalizeList(value: unknown, maxItems = 6) {
  return Array.isArray(value)
    ? dedupeStrings(value.map((item) => trimText(item))).slice(0, maxItems)
    : [];
}

function buildContext(profile: CareerCoachProfile | null): CareerCoachContext {
  const location =
    readWorkplaceLocation(profile?.workplaceLocations) ||
    dedupeStrings([
      trimText(profile?.city),
      trimText(profile?.state),
      trimText(profile?.country),
    ]).join(", ") ||
    null;

  return {
    fullName:
      dedupeStrings([trimText(profile?.firstName), trimText(profile?.lastName)]).join(" ") || null,
    roleFocus: readRoleFocus(profile?.keyQuestions),
    location,
    savedTitles: dedupeStrings((profile?.jobInterests ?? []).map((item) => trimText(item.title))),
    skills: dedupeStrings([...(profile?.skills ?? []), ...(profile?.resumeSkills ?? [])]).slice(
      0,
      10
    ),
    resumeAvailable: Boolean(profile?.resume),
    experienceCount: profile?.resume?.experiences.length ?? 0,
    experiences: (profile?.resume?.experiences ?? []).map((item) => ({
      title: trimText(item.title) || "Role",
      company: trimText(item.company) || "Company",
      location: trimText(item.location) || null,
      dateRange: trimText(item.dateRange) || null,
      bullets: normalizeList(item.bullets.map((bullet) => bullet.text), 3),
    })),
  };
}

function normalizePlan(input: Partial<CareerCoachRequest>, context: CareerCoachContext): CareerCoachPlan {
  const targetRoles =
    trimText(input.targetRoles) ||
    context.roleFocus ||
    context.savedTitles[0] ||
    "your next target role";
  const targetIndustry = trimText(input.targetIndustry) || "the companies and teams that best fit your background";
  const preferredLocation = trimText(input.preferredLocation) || context.location || "the markets where you can realistically compete";
  const experienceLevel =
    trimText(input.experienceLevel) ||
    (context.experienceCount >= 5
      ? "senior-level roles"
      : context.experienceCount >= 2
        ? "mid-level roles"
        : "early-career roles");
  const challenge = trimText(input.biggestChallenge) || "creating more momentum in your search";
  const priority = trimText(input.priority) || "moving from preparation into consistent action";
  const skillLead =
    context.skills.slice(0, 4).join(", ") || "the strengths already visible in your background";
  const recentExperience = context.experiences[0] ?? null;
  const recentAnchor = recentExperience
    ? `${recentExperience.title} experience${recentExperience.company ? ` at ${recentExperience.company}` : ""}`
    : "the profile context available today";

  return {
    summary: `Focus this week on positioning yourself for ${targetRoles} within ${targetIndustry}, with your outreach, resume, and interview prep all reinforcing the same story. The fastest path forward is to reduce friction around ${challenge.toLowerCase()} while prioritizing ${priority.toLowerCase()} in ${preferredLocation}.`,
    whyThisAdvice: `This guidance is based on ${recentAnchor}, your current target of ${targetRoles}, and the context available from ${context.resumeAvailable ? "your uploaded resume plus profile details" : "your profile and intake answers"}. It emphasizes ${skillLead} because those are the clearest signals Hirexa can use right now to shape a focused ${experienceLevel.toLowerCase()} search.`,
    actionPlan: [
      `Refine your top-line positioning for ${targetRoles} so your resume, LinkedIn, and applications all tell the same story.`,
      `Build a weekly search rhythm around ${preferredLocation} opportunities and a shortlist of employers in ${targetIndustry}.`,
      `Update two or three resume bullets so they demonstrate impact instead of listing responsibilities.`,
      `Prepare a short interview narrative that connects your recent experience to ${targetRoles}.`,
      `Create an outreach list of recruiters, hiring managers, or alumni connected to your target companies.`,
      `Choose one skill, project, or proof point that will reduce the risk of ${challenge.toLowerCase()}.`,
    ],
    nextMoves: [
      `Narrow your search to the specific ${targetRoles} titles you want most rather than applying broadly.`,
      `Save 15-20 strong-fit roles in ${preferredLocation} and rank them by alignment and urgency.`,
      `Turn your strongest recent example into a concise achievement story for applications and calls.`,
      `Use your next outreach messages to reinforce why you fit ${targetIndustry} opportunities right now.`,
      `Review your weekly pipeline every Friday and cut activities that are not creating traction.`,
    ],
    resumeAdvice: [
      `Lead with a headline or summary that clearly signals ${targetRoles}.`,
      `Make each recent experience bullet show scope, ownership, and results whenever possible.`,
      `Mirror the language of your target roles so recruiters can quickly see fit.`,
    ],
    interviewTalkingPoints: [
      `Tell a focused story about how your background prepares you for ${targetRoles}.`,
      `Prepare one example that shows judgment, execution, and measurable impact.`,
      `Be ready to explain why ${targetIndustry} is the right next step for you now.`,
    ],
    outreachAdvice: [
      `Reach out with a specific reason you fit the role instead of a generic introduction.`,
      `Reference one relevant accomplishment or capability tied to the target team.`,
      `Keep follow-ups short and value-focused, with a clear next-step ask.`,
    ],
    skillsToBuild: [
      `Deepen the one or two skills most often requested in ${targetRoles} postings.`,
      `Package recent work into a concrete proof point, case study, or project example.`,
      `Strengthen the communication habits that make your value easier to understand quickly.`,
    ],
    risks: [
      `Your search may stay too broad if you do not define the exact ${targetRoles} targets clearly.`,
      `A weak positioning story can make strong experience look less relevant than it is.`,
      `If ${challenge.toLowerCase()} stays unresolved, you may keep doing effort-heavy work that does not compound.`,
    ],
    quickWins: [
      `Refresh your resume summary and LinkedIn headline this week.`,
      `Send three high-quality outreach notes tied to real target roles.`,
      `Practice a tighter answer to "Tell me about yourself" aligned to ${targetRoles}.`,
    ],
  };
}

function coercePlan(candidate: unknown, fallback: CareerCoachPlan): CareerCoachPlan {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return fallback;
  }

  const value = candidate as Record<string, unknown>;
  const readList = (key: CareerCoachPlanListKey, minItems = 3) => {
    const items = normalizeList(value[key], 7);
    return items.length >= minItems ? items : fallback[key];
  };

  return {
    summary: trimText(value.summary, 900) || fallback.summary,
    whyThisAdvice: trimText(value.whyThisAdvice, 900) || fallback.whyThisAdvice,
    actionPlan: readList("actionPlan", 5),
    nextMoves: readList("nextMoves"),
    resumeAdvice: readList("resumeAdvice"),
    interviewTalkingPoints: readList("interviewTalkingPoints"),
    outreachAdvice: readList("outreachAdvice"),
    skillsToBuild: readList("skillsToBuild"),
    risks: readList("risks"),
    quickWins: readList("quickWins"),
  };
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const access = await getHirexaAccessForUser({
      userId,
      sessionEmail: session?.user?.email ?? null,
    });

    if (!access.active) {
      return NextResponse.json(
        { ok: false, error: "Career Coach access requires an active Hirexa plan." },
        { status: 403 }
      );
    }

    const input = (await req.json()) as CareerCoachRequest;
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: careerCoachProfileSelect,
    });

    const context = buildContext(profile);
    const fallbackPlan = normalizePlan(input, context);

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: true, plan: fallbackPlan, source: "fallback" });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = [
      `User name: ${context.fullName ?? "Unknown"}`,
      `Target roles: ${trimText(input.targetRoles) || context.roleFocus || context.savedTitles.join(", ") || "Unknown"}`,
      `Target industry or companies: ${trimText(input.targetIndustry) || "Not specified"}`,
      `Preferred location: ${trimText(input.preferredLocation) || context.location || "Not specified"}`,
      `Experience level: ${trimText(input.experienceLevel) || "Not specified"}`,
      `Biggest current challenge: ${trimText(input.biggestChallenge) || "Not specified"}`,
      `Current priority: ${trimText(input.priority) || "Not specified"}`,
      `Additional context: ${trimText(input.additionalContext, 600) || "None provided"}`,
      `Saved job interests: ${context.savedTitles.join(", ") || "None"}`,
      `Saved skills: ${context.skills.join(", ") || "None"}`,
      `Resume available: ${context.resumeAvailable ? "yes" : "no"}`,
      `Experience history: ${
        context.experiences.length
          ? context.experiences
              .map(
                (item) =>
                  `${item.title} at ${item.company}${item.dateRange ? ` (${item.dateRange})` : ""}`
              )
              .join(" | ")
          : "No parsed experience available"
      }`,
      "Return strict JSON only with keys: summary, whyThisAdvice, actionPlan, nextMoves, resumeAdvice, interviewTalkingPoints, outreachAdvice, skillsToBuild, risks, quickWins.",
      "Each array should contain concise, specific strings. Keep the advice practical, premium, and realistic. Do not invent facts that are not supported by the context.",
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.45,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are Hirexa Career Coach. Produce grounded career strategy advice for a job seeker. The output must be valid JSON only, with concise and actionable language.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown = null;

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    return NextResponse.json({
      ok: true,
      plan: coercePlan(parsed, fallbackPlan),
      source: "openai",
    });
  } catch (error) {
    console.error("[career-coach] generation failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { ok: false, error: "We couldn't generate a career plan right now." },
      { status: 500 }
    );
  }
}
