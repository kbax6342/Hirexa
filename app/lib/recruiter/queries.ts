import "server-only";

import { prisma } from "@/app/lib/prisma";

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

export const recruiterCandidateSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  location: true,
  headline: true,
  resumeText: true,
  skills: true,
  yearsExperience: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  files: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      id: true,
      filename: true,
      mimeType: true,
      fileUrl: true,
      createdAt: true,
    },
  },
} as const;

export const recruiterMatchSelect = {
  id: true,
  candidateId: true,
  jobOrderId: true,
  score: true,
  bestFitReasons: true,
  redFlags: true,
  missingQualifications: true,
  summary: true,
  createdAt: true,
  updatedAt: true,
  candidate: {
    select: recruiterCandidateSelect,
  },
} as const;

export const recruiterSubmissionSelect = {
  id: true,
  jobOrderId: true,
  candidateId: true,
  stage: true,
  notes: true,
  lastOutreachMessage: true,
  createdAt: true,
  updatedAt: true,
  candidate: {
    select: recruiterCandidateSelect,
  },
  stageEvents: {
    orderBy: { createdAt: "desc" as const },
    take: 12,
    select: {
      id: true,
      fromStage: true,
      toStage: true,
      note: true,
      createdAt: true,
    },
  },
} as const;

export async function getRecruiterDashboardSnapshot(agencyId: string) {
  const [jobOrders, candidates, submissions] = await Promise.all([
    prisma.recruiterJobOrder.findMany({
      where: { agencyId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        companyName: true,
        location: true,
        status: true,
        updatedAt: true,
        createdAt: true,
        _count: { select: { matches: true, submissions: true } },
      },
    }),
    prisma.recruiterCandidate.findMany({
      where: { agencyId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: recruiterCandidateSelect,
    }),
    prisma.recruiterSubmission.findMany({
      where: {
        jobOrder: { is: { agencyId } },
      },
      select: {
        id: true,
        stage: true,
      },
    }),
  ]);

  const totalJobOrders = await prisma.recruiterJobOrder.count({ where: { agencyId } });
  const totalCandidates = await prisma.recruiterCandidate.count({ where: { agencyId } });

  return {
    summary: {
      openJobOrders: await prisma.recruiterJobOrder.count({
        where: { agencyId, status: "OPEN" },
      }),
      totalCandidates,
      activeSubmissions: submissions.length,
      interviews: submissions.filter((submission) => submission.stage === "INTERVIEW")
        .length,
      placements: submissions.filter((submission) => submission.stage === "PLACED").length,
      totalJobOrders,
    },
    recentJobOrders: jobOrders,
    recentCandidates: candidates,
  };
}

export async function listRecruiterJobOrders(agencyId: string) {
  return prisma.recruiterJobOrder.findMany({
    where: { agencyId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      companyName: true,
      location: true,
      employmentType: true,
      salaryMin: true,
      salaryMax: true,
      description: true,
      requiredSkills: true,
      preferredSkills: true,
      requiredYearsExperience: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { matches: true, submissions: true } },
    },
  });
}

export async function listRecruiterCandidates(agencyId: string) {
  return prisma.recruiterCandidate.findMany({
    where: { agencyId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      ...recruiterCandidateSelect,
      _count: { select: { matches: true, submissions: true, files: true } },
    },
  });
}

export async function getRecruiterJobOrderDetail(agencyId: string, jobOrderId: string) {
  const jobOrder = await prisma.recruiterJobOrder.findFirst({
    where: {
      id: jobOrderId,
      agencyId,
    },
    select: {
      id: true,
      title: true,
      companyName: true,
      location: true,
      employmentType: true,
      salaryMin: true,
      salaryMax: true,
      description: true,
      requiredSkills: true,
      preferredSkills: true,
      requiredYearsExperience: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      matches: {
        orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
        select: recruiterMatchSelect,
      },
      submissions: {
        orderBy: [{ updatedAt: "desc" }],
        select: recruiterSubmissionSelect,
      },
    },
  });

  if (!jobOrder) return null;

  return {
    ...jobOrder,
    matches: jobOrder.matches.map((match) => ({
      ...match,
      bestFitReasons: readStringArray(match.bestFitReasons),
      redFlags: readStringArray(match.redFlags),
      missingQualifications: readStringArray(match.missingQualifications),
    })),
  };
}

export async function getRecruiterOutreachOptions(agencyId: string) {
  const [jobOrders, candidates] = await Promise.all([
    prisma.recruiterJobOrder.findMany({
      where: { agencyId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        companyName: true,
        location: true,
        employmentType: true,
        requiredSkills: true,
        status: true,
      },
    }),
    prisma.recruiterCandidate.findMany({
      where: { agencyId },
      orderBy: { updatedAt: "desc" },
      select: recruiterCandidateSelect,
    }),
  ]);

  return { jobOrders, candidates };
}
