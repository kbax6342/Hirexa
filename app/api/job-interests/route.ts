import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";

type Job = {
  uuid: string;
  title: string;
};

type JobInterestBody = {
  jobs?: unknown;
  roleFocus?: unknown;
  jobSearchGoal?: unknown;
  jobPriorities?: unknown;
  workStoryTags?: unknown;
  workStoryHighlight?: unknown;
};

const MAX_JOB_PRIORITY_COUNT = 12;
const MAX_WORK_STORY_TAG_COUNT = 20;

function trimText(value: unknown, maxLength = 120) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function normalizeJobs(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: Job[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const title = trimText((item as { title?: unknown }).title);
    if (!title) continue;

    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      uuid: trimText((item as { uuid?: unknown }).uuid, 80) ?? slugify(title),
      title,
    });

    if (normalized.length >= 5) break;
  }

  return normalized;
}

function normalizeTextArray(value: unknown, maxItems = 5, maxLength = 80) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const text = trimText(item, maxLength);
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push(text);

    if (normalized.length >= maxItems) break;
  }

  return normalized;
}

function readKeyQuestions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function hasKey(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function parseCookieArray(rawValue: string | undefined, maxItems = 5) {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return normalizeTextArray(parsed, maxItems);
  } catch {
    return [];
  }
}

async function getSessionScope() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const cookieStore = await cookies();
  const guestId = cookieStore.get("guest_user_id")?.value ?? null;

  return { userId, guestId, cookieStore };
}

export async function GET() {
  try {
    const { userId, guestId, cookieStore } = await getSessionScope();

    if (!userId && !guestId) {
      return NextResponse.json(
        {
          ok: true,
          jobs: [],
          roleFocus: null,
          jobSearchGoal: null,
          jobPriorities: [],
          workStoryTags: [],
          workStoryHighlight: null,
          skills: [],
          resumeSkills: [],
          highlightSkillsConfidence: null,
        },
        { status: 200 }
      );
    }

    const profile = await prisma.userProfile.findUnique({
      where: userId ? { userId } : { guestId: guestId as string },
      select: {
        keyQuestions: true,
        skills: true,
        resumeSkills: true,
        jobInterests: {
          select: { uuid: true, title: true },
          take: 5,
        },
      },
    });

    const keyQuestions = readKeyQuestions(profile?.keyQuestions);
    const cookieTitles = parseCookieArray(
      cookieStore.get("job_interest_titles")?.value
    );
    const jobs =
      profile?.jobInterests?.length
        ? profile.jobInterests
        : cookieTitles.map((title) => ({ uuid: slugify(title), title }));
    const roleFocus =
      trimText(keyQuestions.roleFocus) ??
      jobs[0]?.title ??
      trimText(cookieStore.get("onboarding_role_focus")?.value) ??
      null;
    const jobSearchGoal =
      trimText(keyQuestions.jobSearchGoal) ??
      trimText(cookieStore.get("onboarding_job_search_goal")?.value) ??
      null;
    const savedJobPriorities = normalizeTextArray(
      keyQuestions.jobPriorities,
      MAX_JOB_PRIORITY_COUNT
    );
    const jobPriorities =
      savedJobPriorities.length > 0
        ? savedJobPriorities
        : parseCookieArray(
            cookieStore.get("onboarding_job_priorities")?.value,
            MAX_JOB_PRIORITY_COUNT
          );
    const workStoryTags = hasKey(keyQuestions, "workStoryTags")
      ? normalizeTextArray(keyQuestions.workStoryTags, MAX_WORK_STORY_TAG_COUNT)
      : parseCookieArray(
          cookieStore.get("onboarding_work_story_tags")?.value,
          MAX_WORK_STORY_TAG_COUNT
        );
    const workStoryHighlight = hasKey(keyQuestions, "workStoryHighlight")
      ? trimText(keyQuestions.workStoryHighlight, 500) ?? null
      : trimText(cookieStore.get("onboarding_work_story_highlight")?.value, 500) ??
        null;
    const highlightSkillsConfidence = hasKey(
      keyQuestions,
      "highlightSkillsConfidence"
    )
      ? trimText(keyQuestions.highlightSkillsConfidence, 120) ?? null
      : trimText(
          cookieStore.get("onboarding_highlight_skills_confidence")?.value,
          120
        ) ?? null;

    return NextResponse.json(
      {
        ok: true,
        jobs,
        roleFocus,
        jobSearchGoal,
        jobPriorities,
        workStoryTags,
        workStoryHighlight,
        skills: profile?.skills ?? [],
        resumeSkills: profile?.resumeSkills ?? [],
        highlightSkillsConfidence,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { userId, guestId, cookieStore } = await getSessionScope();

    if (!userId && !guestId) {
      return NextResponse.json(
        { ok: false, error: "Missing user/guest session." },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => null)) as JobInterestBody | null;
    const bodyRecord =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const hasJobPrioritiesField = hasKey(bodyRecord, "jobPriorities");
    const hasWorkStoryTagsField = hasKey(bodyRecord, "workStoryTags");
    const hasWorkStoryHighlightField = hasKey(bodyRecord, "workStoryHighlight");
    const roleFocusFromBody = trimText(body?.roleFocus);
    const jobsFromBody = normalizeJobs(body?.jobs);

    const existingProfile = await prisma.userProfile.findUnique({
      where: userId ? { userId } : { guestId: guestId as string },
      select: {
        id: true,
        keyQuestions: true,
        jobInterests: {
          select: { uuid: true, title: true },
          take: 5,
        },
      },
    });

    const existingKeyQuestions = readKeyQuestions(existingProfile?.keyQuestions);
    const cookieTitles = parseCookieArray(
      cookieStore.get("job_interest_titles")?.value
    );
    const savedJobs =
      existingProfile?.jobInterests?.length
        ? existingProfile.jobInterests
        : cookieTitles.map((title) => ({ uuid: slugify(title), title }));
    const jobs =
      jobsFromBody.length > 0
        ? jobsFromBody
        : roleFocusFromBody
        ? [{ uuid: slugify(roleFocusFromBody), title: roleFocusFromBody }]
        : savedJobs;
    const roleFocus =
      roleFocusFromBody ??
      trimText(existingKeyQuestions.roleFocus) ??
      jobs[0]?.title ??
      null;
    const jobSearchGoal = trimText(body?.jobSearchGoal);
    const jobPriorities = normalizeTextArray(
      body?.jobPriorities,
      MAX_JOB_PRIORITY_COUNT
    );
    const workStoryTags = normalizeTextArray(
      body?.workStoryTags,
      MAX_WORK_STORY_TAG_COUNT
    );
    const workStoryHighlight = trimText(body?.workStoryHighlight, 500);

    if (
      jobs.length === 0 &&
      !jobSearchGoal &&
      !hasJobPrioritiesField &&
      !hasWorkStoryTagsField &&
      !hasWorkStoryHighlightField
    ) {
      return NextResponse.json(
        { ok: false, error: "No jobs provided." },
        { status: 400 }
      );
    }

    const nextKeyQuestions = {
      ...existingKeyQuestions,
      ...(roleFocus ? { roleFocus } : {}),
      ...(jobSearchGoal ? { jobSearchGoal } : {}),
      ...(jobPriorities.length > 0 ? { jobPriorities } : {}),
      ...(hasWorkStoryTagsField ? { workStoryTags } : {}),
      ...(hasWorkStoryHighlightField ? { workStoryHighlight } : {}),
    };

    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId as string },
      create: {
        ...(userId ? { userId } : { guestId: guestId as string }),
        keyQuestions: nextKeyQuestions as Prisma.InputJsonValue,
      },
      update: {
        keyQuestions: nextKeyQuestions as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    if (jobs.length > 0) {
      await prisma.$transaction([
        prisma.jobInterest.deleteMany({ where: { userProfileId: profile.id } }),
        prisma.jobInterest.createMany({
          data: jobs.map((job) => ({
            userProfileId: profile.id,
            uuid: job.uuid,
            title: job.title,
          })),
          skipDuplicates: true,
        }),
      ]);
    }

    const jobIds = jobs.map((job) => job.uuid);
    const jobTitles = jobs.map((job) => job.title);

    if (jobs.length > 0) {
      cookieStore.set("job_interest_ids", JSON.stringify(jobIds), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      cookieStore.set("job_interest_titles", JSON.stringify(jobTitles), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      cookieStore.set("job_interest_count", String(jobs.length), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      cookieStore.set("onboarding_job_interests_saved", "1", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }

    if (roleFocus) {
      cookieStore.set("onboarding_role_focus", roleFocus, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }

    if (jobSearchGoal) {
      cookieStore.set("onboarding_job_search_goal", jobSearchGoal, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }

    if (jobPriorities.length > 0) {
      cookieStore.set("onboarding_job_priorities", JSON.stringify(jobPriorities), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }

    if (hasWorkStoryTagsField) {
      if (workStoryTags.length > 0) {
        cookieStore.set(
          "onboarding_work_story_tags",
          JSON.stringify(workStoryTags),
          {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
          }
        );
      } else {
        cookieStore.set("onboarding_work_story_tags", "", {
          path: "/",
          maxAge: 0,
        });
      }
    }

    if (hasWorkStoryHighlightField) {
      if (workStoryHighlight) {
        cookieStore.set("onboarding_work_story_highlight", workStoryHighlight, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
      } else {
        cookieStore.set("onboarding_work_story_highlight", "", {
          path: "/",
          maxAge: 0,
        });
      }
    }

    invalidateCachedProfile({ userId, guestId });

    return NextResponse.json(
      {
        ok: true,
        jobs: {
          count: jobs.length,
          ids: jobIds,
          titles: jobTitles,
        },
        roleFocus,
        jobSearchGoal,
        jobPriorities,
        workStoryTags,
        workStoryHighlight,
        savedToDatabase: true,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
