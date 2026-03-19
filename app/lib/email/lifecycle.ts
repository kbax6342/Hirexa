import "server-only";

import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/app/lib/prisma";
import {
  sendApplicationActivityEmail,
  sendCompleteProfileReminderEmail,
  sendCreditsRenewedEmail,
  sendFirstMatchesReadyEmail,
  sendHirePilotCreditsExpiringSoonEmail,
  sendHirePilotLowCreditWarningEmail,
  sendInactiveComebackEmail,
  sendInterviewPrepReminderEmail,
  sendJobDigestEmail,
  sendRegistrationConfirmedEmail,
  sendResumeUploadedEmail,
  sendUploadResumeReminderEmail,
} from "@/app/lib/email/sendgrid";
import { getSiteUrl } from "@/app/lib/site-url";
import { getHirePilotCreditSummary } from "@/app/lib/hirepilot/credits";
import {
  getCachedQueryProviderJobs,
  getSharedProviderSnapshot,
} from "@/app/lib/jobs/collectJobs";
import {
  getSmartMatchSearchConfigForUser,
  type SmartMatchSearchConfig,
} from "@/app/lib/jobs/smartMatchSearch";
import { type Job } from "@/app/lib/jobs/types";
import { applyJobMatchStages, dedupeJobs } from "@/app/lib/jobs/sources/common";
import {
  getSafePrivateProfileFields,
  readRawPrivateProfileFieldsByIds,
} from "@/app/lib/profile/privateProfileFields";

const PROFILE_REMINDER_DELAY_MS = 2 * 60 * 60 * 1000;
const RESUME_REMINDER_DELAY_MS = 8 * 60 * 60 * 1000;
const DIGEST_LIMIT = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

type LifecycleSendResult = {
  sent: boolean;
  reason: string;
};

type EmailLifecycleSummary = {
  checkedProfiles: number;
  sent: Record<string, number>;
  skipped: Record<string, number>;
  errors: Array<{ type: string; profileId?: string; userId?: string; error: string }>;
};

type LifecycleProfileRecord = {
  id: string;
  userId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
  newsletterOptIn: boolean;
  unsubscribedAt: Date | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  resume: { id: string; updatedAt: Date | null } | null;
  resumeFiles: Array<{ id: string; createdAt: Date }>;
  jobApplications: Array<{ id: string; updatedAt: Date }>;
};

function normalizeEmail(value?: string | null) {
  const email = value?.trim().toLowerCase();
  return email ? email : null;
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatUtcDay(date: Date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

function hashResumeFingerprint(payload: unknown) {
  return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function incrementCounter(store: Record<string, number>, key: string) {
  store[key] = (store[key] ?? 0) + 1;
}

function emptySummary(): EmailLifecycleSummary {
  return {
    checkedProfiles: 0,
    sent: {},
    skipped: {},
    errors: [],
  };
}

async function hasLifecycleEvent(dedupeKey: string) {
  const event = await prisma.emailLifecycleEvent.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });

  return Boolean(event?.id);
}

async function sendLifecycleEmailOnce(params: {
  userProfileId?: string | null;
  email: string;
  eventKey: string;
  eventGroup: string;
  dedupeKey: string;
  meta?: Prisma.InputJsonValue;
  send: () => Promise<void>;
}): Promise<LifecycleSendResult> {
  try {
    await prisma.emailLifecycleEvent.create({
      data: {
        userProfileId: params.userProfileId ?? null,
        email: params.email,
        eventKey: params.eventKey,
        eventGroup: params.eventGroup,
        dedupeKey: params.dedupeKey,
        meta: params.meta,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { sent: false, reason: "duplicate" };
    }

    throw error;
  }

  try {
    await params.send();
    return { sent: true, reason: "sent" };
  } catch (error) {
    await prisma.emailLifecycleEvent
      .delete({ where: { dedupeKey: params.dedupeKey } })
      .catch(() => undefined);
    throw error;
  }
}

function resolveLifecycleEmail(profile: {
  email?: string | null;
  user?: { email?: string | null } | null;
}) {
  return normalizeEmail(profile.email ?? profile.user?.email ?? null);
}

function canReceiveLifecycleReminder(profile: {
  email: string | null;
  unsubscribedAt: Date | null;
}) {
  return Boolean(profile.email) && !profile.unsubscribedAt;
}

function canReceiveLifecycleDigest(profile: {
  email: string | null;
  newsletterOptIn: boolean;
  unsubscribedAt: Date | null;
}) {
  return Boolean(profile.email) && profile.newsletterOptIn && !profile.unsubscribedAt;
}

function hasResume(profile: Pick<LifecycleProfileRecord, "resume" | "resumeFiles">) {
  return Boolean(profile.resume?.id) || profile.resumeFiles.length > 0;
}

function isProfileCompleteEnough(
  profile: Pick<
    LifecycleProfileRecord,
    "firstName" | "lastName" | "phone" | "email" | "linkedinUrl" | "portfolioUrl"
  >,
  safeLocation: { city: string | null; state: string | null }
) {
  const requiredFields = [
    profile.firstName?.trim(),
    profile.lastName?.trim(),
    profile.email?.trim(),
    profile.phone?.trim(),
    safeLocation.city?.trim(),
    safeLocation.state?.trim(),
  ];

  return requiredFields.every(Boolean);
}

function hasPersonalizedMatchConfig(config: SmartMatchSearchConfig) {
  return (
    config.jobTitles.length > 0 ||
    config.skillTerms.length > 0 ||
    Boolean(config.preferredLocation) ||
    config.locationOptions.length > 0
  );
}

function toJobSummary(job: Job) {
  return {
    title: job.title,
    company: job.company,
    location: job.location ?? null,
    jobUrl: job.jobUrl ?? null,
  };
}

async function collectLifecycleMatchingJobs(
  userId: string,
  limit = DIGEST_LIMIT
): Promise<{ config: SmartMatchSearchConfig; jobs: Job[] }> {
  const config = await getSmartMatchSearchConfigForUser(userId);
  if (!hasPersonalizedMatchConfig(config)) {
    return { config, jobs: [] };
  }

  const location = config.preferredLocation ?? config.locationOptions[0] ?? "";
  const args = {
    query: config.searchQuery,
    location,
    page: 1,
    limit: Math.max(limit, 12),
    includeRemote: config.includeRemote,
  };

  const [sharedResult, adzunaResult, usajobsResult] = await Promise.allSettled([
    getSharedProviderSnapshot(config.searchQuery),
    getCachedQueryProviderJobs("adzuna", args),
    getCachedQueryProviderJobs("usajobs", args),
  ]);

  const sharedJobs =
    sharedResult.status === "fulfilled"
      ? [
          ...sharedResult.value.snapshot.greenhouseJobs,
          ...sharedResult.value.snapshot.leverJobs,
          ...sharedResult.value.snapshot.ashbyJobs,
          ...sharedResult.value.snapshot.workableJobs,
          ...sharedResult.value.snapshot.remotiveJobs,
          ...sharedResult.value.snapshot.remoteokJobs,
        ]
      : [];
  const adzunaJobs = adzunaResult.status === "fulfilled" ? adzunaResult.value.jobs : [];
  const usajobsJobs = usajobsResult.status === "fulfilled" ? usajobsResult.value.jobs : [];

  const stages = applyJobMatchStages(dedupeJobs([...sharedJobs, ...adzunaJobs, ...usajobsJobs]), args);
  return { config, jobs: stages.finalJobs.slice(0, limit) };
}

function buildApplicationStatusCopy(status: string, failureReason?: string | null) {
  switch (status) {
    case "SENT":
    case "SUBMITTED":
      return {
        statusLabel: "Submitted",
        details: "Hirexa recorded your application as submitted.",
      };
    case "NEEDS_VERIFICATION":
      return {
        statusLabel: "Needs attention",
        details:
          "Your application needs a verification step before submission can be completed.",
      };
    case "READY_TO_SEND":
      return {
        statusLabel: "Ready for review",
        details:
          "Your application is prepared, but a manual review or final submission step is still needed.",
      };
    case "FAILED":
      return {
        statusLabel: "Needs attention",
        details: failureReason?.trim()
          ? `Hirexa could not confirm submission: ${failureReason.trim()}`
          : "Hirexa could not confirm submission for this application.",
      };
    default:
      return null;
  }
}

function getInactivityDays(lastActivityAt: Date, now: Date) {
  return Math.floor((now.getTime() - lastActivityAt.getTime()) / DAY_MS);
}

function getExpiringThresholdDays(expiresAt: Date, now: Date) {
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
  if (daysLeft <= 1) return 1;
  if (daysLeft <= 7) return 7;
  if (daysLeft <= 30) return 30;
  return null;
}

async function getLifecycleProfilesForCron() {
  return prisma.userProfile.findMany({
    where: {
      email: { not: null },
      userId: { not: null },
    },
    select: {
      id: true,
      userId: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      createdAt: true,
      updatedAt: true,
      newsletterOptIn: true,
      unsubscribedAt: true,
      linkedinUrl: true,
      portfolioUrl: true,
      resume: {
        select: {
          id: true,
          updatedAt: true,
        },
      },
      resumeFiles: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          createdAt: true,
        },
      },
      jobApplications: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          updatedAt: true,
        },
      },
    },
  });
}

export async function sendRegistrationConfirmedEmailIfNeeded(
  profileId: string
): Promise<LifecycleSendResult> {
  const profile = await prisma.userProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      email: true,
      firstName: true,
      welcomeEmailSentAt: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!profile) {
    return { sent: false, reason: "missing-profile" };
  }

  const email = resolveLifecycleEmail(profile);
  if (!email) {
    return { sent: false, reason: "missing-email" };
  }

  if (profile.welcomeEmailSentAt) {
    return { sent: false, reason: "already-sent" };
  }

  const claimed = await prisma.userProfile.updateMany({
    where: { id: profile.id, welcomeEmailSentAt: null },
    data: { welcomeEmailSentAt: new Date() },
  });

  if (claimed.count !== 1) {
    return { sent: false, reason: "already-claimed" };
  }

  try {
    await sendRegistrationConfirmedEmail(email, profile.firstName);
    return { sent: true, reason: "sent" };
  } catch (error) {
    console.warn("[email lifecycle] registration confirmed email failed", {
      profileId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { sent: false, reason: "send-failed" };
  }
}

export async function sendResumeUploadedEmailIfNeeded(params: {
  profileId: string;
  resumeId: string;
  filename?: string | null;
  mimeType?: string | null;
  experienceTitles?: string[];
}): Promise<LifecycleSendResult> {
  const profile = await prisma.userProfile.findUnique({
    where: { id: params.profileId },
    select: {
      id: true,
      email: true,
      firstName: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!profile) {
    return { sent: false, reason: "missing-profile" };
  }

  const email = resolveLifecycleEmail(profile);
  if (!email) {
    return { sent: false, reason: "missing-email" };
  }

  const dedupeKey = `resume-uploaded:${profile.id}:${hashResumeFingerprint({
    resumeId: params.resumeId,
    filename: params.filename ?? "",
    mimeType: params.mimeType ?? "",
    experienceTitles: params.experienceTitles?.slice(0, 5) ?? [],
  })}`;

  return sendLifecycleEmailOnce({
    userProfileId: profile.id,
    email,
    eventKey: "resume_uploaded",
    eventGroup: "resume",
    dedupeKey,
    meta: {
      resumeId: params.resumeId,
      filename: params.filename ?? null,
      mimeType: params.mimeType ?? null,
    } as Prisma.InputJsonValue,
    send: () =>
      sendResumeUploadedEmail({
        to: email,
        name: profile.firstName,
      }),
  });
}

export async function sendApplicationActivityEmailForStatusChange(params: {
  applicationId: string;
  previousStatus?: string | null;
  nextStatus: string;
}): Promise<LifecycleSendResult> {
  if (params.previousStatus === params.nextStatus) {
    return { sent: false, reason: "unchanged" };
  }

  const copy = buildApplicationStatusCopy(params.nextStatus);
  if (!copy) {
    return { sent: false, reason: "ignored-status" };
  }

  const application = await prisma.jobApplication.findUnique({
    where: { id: params.applicationId },
    select: {
      id: true,
      title: true,
      jobTitle: true,
      company: true,
      status: true,
      updatedAt: true,
      submittedAt: true,
      failureReason: true,
      userProfile: {
        select: {
          id: true,
          email: true,
          firstName: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      },
    },
  });

  if (!application?.userProfile) {
    return { sent: false, reason: "missing-application" };
  }

  const email = resolveLifecycleEmail(application.userProfile);
  if (!email) {
    return { sent: false, reason: "missing-email" };
  }

  const jobTitle = application.title?.trim() || application.jobTitle?.trim() || "Your application";
  const actionUrl = `${getSiteUrl()}/dashboard/application/${application.id}/audit`;
  const dedupeMoment = application.submittedAt ?? application.updatedAt;

  return sendLifecycleEmailOnce({
    userProfileId: application.userProfile.id,
    email,
    eventKey: "application_activity",
    eventGroup: "application",
    dedupeKey: `application-activity:${application.id}:${params.nextStatus}:${dedupeMoment.toISOString()}`,
    meta: {
      applicationId: application.id,
      previousStatus: params.previousStatus ?? null,
      nextStatus: params.nextStatus,
    } as Prisma.InputJsonValue,
    send: () =>
      sendApplicationActivityEmail({
        to: email,
        name: application.userProfile.firstName,
        title: jobTitle,
        company: application.company,
        statusLabel: copy.statusLabel,
        details:
          params.nextStatus === "FAILED"
            ? buildApplicationStatusCopy(params.nextStatus, application.failureReason)?.details ??
              copy.details
            : copy.details,
        actionUrl,
      }),
  });
}

export async function sendHirePilotCreditsRenewedEmailIfNeeded(params: {
  userId: string;
  dedupeKey: string;
  creditsAdded: number;
  sourceLabel: "monthly" | "purchase";
}): Promise<LifecycleSendResult> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId: params.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!profile) {
    return { sent: false, reason: "missing-profile" };
  }

  const email = resolveLifecycleEmail(profile);
  if (!email) {
    return { sent: false, reason: "missing-email" };
  }

  const summary = await getHirePilotCreditSummary(params.userId);

  return sendLifecycleEmailOnce({
    userProfileId: profile.id,
    email,
    eventKey: "credits_renewed",
    eventGroup: "credits",
    dedupeKey: params.dedupeKey,
    meta: {
      userId: params.userId,
      creditsAdded: params.creditsAdded,
      sourceLabel: params.sourceLabel,
      totalAvailable: summary.totalAvailable,
    } as Prisma.InputJsonValue,
    send: () =>
      sendCreditsRenewedEmail({
        to: email,
        name: profile.firstName,
        creditsAdded: params.creditsAdded,
        totalAvailable: summary.totalAvailable,
        sourceLabel: params.sourceLabel,
        nextResetAt: summary.nextMonthlyResetAt,
        expiresAt: summary.earliestPurchasedExpiryAt,
      }),
  });
}

export async function sendManualInterviewPrepReminder(params: {
  userId: string;
  jobTitle: string;
  company?: string | null;
  interviewAt?: string | Date | null;
  focusAreas?: string[];
}): Promise<LifecycleSendResult> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId: params.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!profile) {
    return { sent: false, reason: "missing-profile" };
  }

  const email = resolveLifecycleEmail(profile);
  if (!email) {
    return { sent: false, reason: "missing-email" };
  }

  const interviewAt = params.interviewAt ? new Date(params.interviewAt) : null;
  const dedupeKey = `interview-prep:${profile.id}:${hashResumeFingerprint({
    jobTitle: params.jobTitle,
    company: params.company ?? "",
    interviewAt: interviewAt?.toISOString() ?? "",
  })}`;

  return sendLifecycleEmailOnce({
    userProfileId: profile.id,
    email,
    eventKey: "interview_prep",
    eventGroup: "interview",
    dedupeKey,
    meta: {
      jobTitle: params.jobTitle,
      company: params.company ?? null,
      interviewAt: interviewAt?.toISOString() ?? null,
    } as Prisma.InputJsonValue,
    send: () =>
      sendInterviewPrepReminderEmail({
        to: email,
        name: profile.firstName,
        jobTitle: params.jobTitle,
        company: params.company ?? null,
        interviewAt,
        focusAreas: params.focusAreas ?? [],
      }),
  });
}

async function maybeSendProfileCompletionReminder(
  profile: LifecycleProfileRecord,
  safeLocation: { city: string | null; state: string | null },
  now: Date
) {
  if (!canReceiveLifecycleReminder(profile)) {
    return { sent: false, reason: "suppressed" };
  }

  if (now.getTime() - profile.createdAt.getTime() < PROFILE_REMINDER_DELAY_MS) {
    return { sent: false, reason: "too-early" };
  }

  if (isProfileCompleteEnough(profile, safeLocation)) {
    return { sent: false, reason: "complete" };
  }

  return sendLifecycleEmailOnce({
    userProfileId: profile.id,
    email: profile.email as string,
    eventKey: "complete_profile_reminder",
    eventGroup: "onboarding",
    dedupeKey: `complete-profile-reminder:${profile.id}`,
    send: () =>
      sendCompleteProfileReminderEmail({
        to: profile.email as string,
        name: profile.firstName,
      }),
  });
}

async function maybeSendResumeReminder(profile: LifecycleProfileRecord, now: Date) {
  if (!canReceiveLifecycleReminder(profile)) {
    return { sent: false, reason: "suppressed" };
  }

  if (now.getTime() - profile.createdAt.getTime() < RESUME_REMINDER_DELAY_MS) {
    return { sent: false, reason: "too-early" };
  }

  if (hasResume(profile)) {
    return { sent: false, reason: "has-resume" };
  }

  return sendLifecycleEmailOnce({
    userProfileId: profile.id,
    email: profile.email as string,
    eventKey: "upload_resume_reminder",
    eventGroup: "onboarding",
    dedupeKey: `upload-resume-reminder:${profile.id}`,
    send: () =>
      sendUploadResumeReminderEmail({
        to: profile.email as string,
        name: profile.firstName,
      }),
  });
}

async function maybeSendMatchEmails(
  profile: LifecycleProfileRecord,
  summary: EmailLifecycleSummary,
  now: Date
) {
  if (!profile.userId) {
    incrementCounter(summary.skipped, "matches-missing-user");
    return;
  }

  const firstMatchesKey = `first-smart-matches-ready:${profile.id}`;
  const digestKey = `job-digest:${profile.id}:${formatUtcDay(now)}`;
  const needsFirstMatches = !(await hasLifecycleEvent(firstMatchesKey));
  const needsDigest = canReceiveLifecycleDigest(profile) && !(await hasLifecycleEvent(digestKey));

  if (!needsFirstMatches && !needsDigest) {
    incrementCounter(summary.skipped, "matches-already-sent");
    return;
  }

  const { config, jobs } = await collectLifecycleMatchingJobs(profile.userId);
  if (!hasPersonalizedMatchConfig(config) || jobs.length === 0) {
    incrementCounter(summary.skipped, "matches-none");
    return;
  }

  if (needsFirstMatches && canReceiveLifecycleReminder(profile)) {
    const result = await sendLifecycleEmailOnce({
      userProfileId: profile.id,
      email: profile.email as string,
      eventKey: "first_smart_matches_ready",
      eventGroup: "matches",
      dedupeKey: firstMatchesKey,
      send: () =>
        sendFirstMatchesReadyEmail({
          to: profile.email as string,
          name: profile.firstName,
          jobs: jobs.slice(0, 5).map(toJobSummary),
        }),
    });

    incrementCounter(summary[result.sent ? "sent" : "skipped"], "first-smart-matches-ready");
  }

  if (needsDigest) {
    const result = await sendLifecycleEmailOnce({
      userProfileId: profile.id,
      email: profile.email as string,
      eventKey: "job_digest",
      eventGroup: "digest",
      dedupeKey: digestKey,
      meta: { date: formatUtcDay(now) } as Prisma.InputJsonValue,
      send: () =>
        sendJobDigestEmail({
          to: profile.email as string,
          name: profile.firstName,
          jobs: jobs.map(toJobSummary),
          frequencyLabel: "Today’s",
        }),
    });

    incrementCounter(summary[result.sent ? "sent" : "skipped"], "job-digest");
  }
}

async function maybeSendInactivityEmail(
  profile: LifecycleProfileRecord,
  now: Date
): Promise<LifecycleSendResult> {
  if (!canReceiveLifecycleDigest(profile)) {
    return { sent: false, reason: "suppressed" };
  }

  const lastActivityAt = [
    profile.createdAt,
    profile.resume?.updatedAt ?? null,
    profile.resumeFiles[0]?.createdAt ?? null,
    profile.jobApplications[0]?.updatedAt ?? null,
  ]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];

  const daysInactive = getInactivityDays(lastActivityAt, now);
  const threshold = daysInactive >= 14 ? 14 : daysInactive >= 7 ? 7 : null;
  if (!threshold) {
    return { sent: false, reason: "not-inactive" };
  }

  return sendLifecycleEmailOnce({
    userProfileId: profile.id,
    email: profile.email as string,
    eventKey: threshold === 14 ? "inactive_comeback_14d" : "inactive_comeback_7d",
    eventGroup: "inactive",
    dedupeKey: `inactive-comeback:${profile.id}:${threshold}d`,
    meta: { daysInactive } as Prisma.InputJsonValue,
    send: () =>
      sendInactiveComebackEmail({
        to: profile.email as string,
        name: profile.firstName,
        daysInactive,
      }),
  });
}

async function maybeSendCreditLifecycleEmails(
  profile: LifecycleProfileRecord,
  summary: EmailLifecycleSummary,
  now: Date
) {
  if (!profile.userId || !profile.email) {
    incrementCounter(summary.skipped, "credits-missing-user");
    return;
  }

  const creditSummary = await getHirePilotCreditSummary(profile.userId);

  if (creditSummary.lowBalance) {
    const lowKey = `credits-low:${profile.id}:${formatUtcDay(now)}`;
    const result = await sendLifecycleEmailOnce({
      userProfileId: profile.id,
      email: profile.email,
      eventKey: "credits_low",
      eventGroup: "credits",
      dedupeKey: lowKey,
      meta: { totalAvailable: creditSummary.totalAvailable } as Prisma.InputJsonValue,
      send: () =>
        sendHirePilotLowCreditWarningEmail({
          to: profile.email as string,
          name: profile.firstName,
          creditsRemaining: creditSummary.totalAvailable,
        }),
    });

    incrementCounter(summary[result.sent ? "sent" : "skipped"], "credits-low");
  }

  if (creditSummary.expiringSoon.length > 0) {
    const earliest = [...creditSummary.expiringSoon].sort(
      (left, right) => left.expiresAt.getTime() - right.expiresAt.getTime()
    )[0];
    const threshold = getExpiringThresholdDays(earliest.expiresAt, now);

    if (threshold) {
      const creditsExpiring = creditSummary.expiringSoon.reduce(
        (total, item) => total + item.remainingCredits,
        0
      );
      const expiringKey = `credits-expiring:${profile.id}:${threshold}:${earliest.expiresAt
        .toISOString()
        .slice(0, 10)}`;
      const result = await sendLifecycleEmailOnce({
        userProfileId: profile.id,
        email: profile.email,
        eventKey: `credits_expiring_${threshold}d`,
        eventGroup: "credits",
        dedupeKey: expiringKey,
        meta: {
          threshold,
          creditsExpiring,
          expiresAt: earliest.expiresAt.toISOString(),
        } as Prisma.InputJsonValue,
        send: () =>
          sendHirePilotCreditsExpiringSoonEmail({
            to: profile.email as string,
            name: profile.firstName,
            creditsExpiring,
            expiresAt: earliest.expiresAt,
          }),
      });

      incrementCounter(summary[result.sent ? "sent" : "skipped"], "credits-expiring");
    }
  }
}

export async function runEmailLifecycleCron(now = new Date()): Promise<EmailLifecycleSummary> {
  const summary = emptySummary();
  const profiles = await getLifecycleProfilesForCron();
  summary.checkedProfiles = profiles.length;

  const rawPrivateFieldsById = await readRawPrivateProfileFieldsByIds(
    prisma,
    profiles.map((profile) => profile.id)
  );

  for (const profile of profiles) {
    try {
      const safePrivate = getSafePrivateProfileFields(rawPrivateFieldsById.get(profile.id) ?? {});
      const safeLocation = {
        city: safePrivate.city,
        state: safePrivate.state,
      };

      const profileReminder = await maybeSendProfileCompletionReminder(profile, safeLocation, now);
      incrementCounter(
        summary[profileReminder.sent ? "sent" : "skipped"],
        "complete-profile-reminder"
      );

      const resumeReminder = await maybeSendResumeReminder(profile, now);
      incrementCounter(summary[resumeReminder.sent ? "sent" : "skipped"], "upload-resume-reminder");

      await maybeSendMatchEmails(profile, summary, now);

      const inactivity = await maybeSendInactivityEmail(profile, now);
      incrementCounter(summary[inactivity.sent ? "sent" : "skipped"], "inactive-comeback");

      await maybeSendCreditLifecycleEmails(profile, summary, now);
    } catch (error) {
      summary.errors.push({
        type: "profile-processing",
        profileId: profile.id,
        userId: profile.userId ?? undefined,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
