import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/app/lib/prisma";

function toAuditMetadata(value: unknown): Prisma.InputJsonValue {
  if (value == null) {
    return {};
  }

  if (Array.isArray(value)) {
    return value as Prisma.InputJsonValue;
  }

  if (typeof value === "object") {
    return value as Prisma.InputJsonValue;
  }

  return {
    value: String(value),
  };
}

export async function createResumeEvaluationAuditLog(args: {
  resumeSubmissionId: string;
  jobRequisitionId: string;
  action: string;
  actorId?: string | null;
  metadata?: unknown;
}) {
  return prisma.resumeEvaluationAuditLog.create({
    data: {
      resumeSubmissionId: args.resumeSubmissionId,
      jobRequisitionId: args.jobRequisitionId,
      action: args.action,
      actorId: args.actorId ?? null,
      metadata: toAuditMetadata(args.metadata),
    },
  });
}

export function formatResumeAuditAction(action: string) {
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
