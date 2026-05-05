import { NextResponse } from "next/server";

import { createResumeEvaluationAuditLog } from "@/app/lib/audit/resumeEvaluationAudit";
import { prisma } from "@/app/lib/prisma";
import { parseRecruiterCandidateInput } from "@/app/lib/recruiter/parseCandidateResume";
import { requireRecruiterAgencyForApi } from "@/app/lib/recruiter/server";
import {
  extractResumeProfile,
  type StructuredResumeProfile,
} from "@/app/lib/resumes/extractResumeProfile";
import { parseResumeFile, UnsupportedResumeFileTypeError } from "@/app/lib/resumes/parseResumeFile";
import {
  ensureJobRequisitionForJobOrder,
  getRecruiterResumeSnapshot,
} from "@/app/lib/resumes/recruiterResumeEvaluator";
import { redactResumeForScoring } from "@/app/lib/resumes/redactResumeForScoring";
import { storeResumeFile } from "@/app/lib/storage/resumeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{ jobId: string }>;
};

function inferNameFromFilename(fileName: string) {
  const normalized = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  return normalized || null;
}

function buildCandidateName(args: {
  firstName?: string | null;
  lastName?: string | null;
  fallbackName?: string | null;
}) {
  const parts = [args.firstName, args.lastName]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" ");
  return args.fallbackName ?? null;
}

async function upsertCandidateProfile(args: {
  agencyId: string;
  fileName: string;
  parsedCandidate: Awaited<ReturnType<typeof parseRecruiterCandidateInput>>;
  structuredProfile: StructuredResumeProfile;
}) {
  const email = args.structuredProfile.possibleContactInfo.email?.trim().toLowerCase() ?? null;
  const phone = args.structuredProfile.possibleContactInfo.phone?.trim() ?? null;
  const fallbackName = inferNameFromFilename(args.fileName);
  const name = buildCandidateName({
    firstName: args.parsedCandidate.firstName,
    lastName: args.parsedCandidate.lastName,
    fallbackName,
  });
  const currentTitle = args.parsedCandidate.headline ?? args.structuredProfile.roles[0] ?? null;

  if (email) {
    const existing = await prisma.candidateProfile.findFirst({
      where: {
        agencyId: args.agencyId,
        email,
      },
      select: { id: true },
    });

    if (existing) {
      return prisma.candidateProfile.update({
        where: { id: existing.id },
        data: {
          name: name ?? undefined,
          email,
          phone: phone ?? undefined,
          currentTitle: currentTitle ?? undefined,
          location: args.parsedCandidate.location ?? undefined,
        },
      });
    }
  }

  return prisma.candidateProfile.create({
    data: {
      agencyId: args.agencyId,
      name,
      email,
      phone,
      currentTitle,
      location: args.parsedCandidate.location,
    },
  });
}

export async function POST(req: Request, props: RouteProps) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const { jobId } = await props.params;
  const ensured = await ensureJobRequisitionForJobOrder({
    agencyId: context.agency.id,
    jobOrderId: jobId,
  });

  if (!ensured) {
    return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
  }

  const formData = await req.formData();
  const fileEntries = [
    ...formData.getAll("resumes"),
    ...formData.getAll("resume"),
  ].filter((entry): entry is File => entry instanceof File);

  if (!fileEntries.length) {
    return NextResponse.json(
      { ok: false, error: "Upload at least one PDF or DOCX resume." },
      { status: 400 }
    );
  }

  const createdSubmissionIds: string[] = [];
  const errors: string[] = [];

  for (const file of fileEntries) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const stored = await storeResumeFile({
        buffer,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        jobRequisitionId: ensured.jobRequisition.id,
      });

      const parsedFile = await parseResumeFile({
        buffer,
        fileName: file.name,
        mimeType: file.type,
      });
      const redaction = redactResumeForScoring(parsedFile.text);
      const structuredProfile = await extractResumeProfile({
        parsedText: parsedFile.text,
        redactionNotes: redaction.redactionNotes,
      });
      const parsedCandidate = await parseRecruiterCandidateInput({
        resumeText: parsedFile.text,
      });
      const candidate = await upsertCandidateProfile({
        agencyId: context.agency.id,
        fileName: file.name,
        parsedCandidate,
        structuredProfile,
      });

      const submission = await prisma.resumeSubmission.create({
        data: {
          candidateId: candidate.id,
          jobRequisitionId: ensured.jobRequisition.id,
          originalFileName: file.name,
          fileUrl: stored.fileUrl,
          storageKey: stored.storageKey,
          mimeType: parsedFile.normalizedMimeType,
          parsedText: parsedFile.text,
          parsedJson: structuredProfile,
          status: "PARSED",
        },
      });

      createdSubmissionIds.push(submission.id);

      await createResumeEvaluationAuditLog({
        resumeSubmissionId: submission.id,
        jobRequisitionId: ensured.jobRequisition.id,
        action: "resume_uploaded",
        actorId: context.userId,
        metadata: {
          originalFileName: file.name,
          mimeType: parsedFile.normalizedMimeType,
          storageProvider: stored.provider,
          storageKey: stored.storageKey,
        },
      });

      await createResumeEvaluationAuditLog({
        resumeSubmissionId: submission.id,
        jobRequisitionId: ensured.jobRequisition.id,
        action: "resume_parsed",
        actorId: context.userId,
        metadata: {
          parsedCharacters: parsedFile.text.length,
          extractedSkills: structuredProfile.skills.slice(0, 12),
          redactionNotes: structuredProfile.redactionNotes,
        },
      });
    } catch (error) {
      errors.push(
        error instanceof UnsupportedResumeFileTypeError
          ? `${file.name}: ${error.message}`
          : `${file.name}: ${
              error instanceof Error ? error.message : "Unable to upload and parse this resume."
            }`
      );
    }
  }

  if (!createdSubmissionIds.length) {
    return NextResponse.json(
      {
        ok: false,
        error: errors[0] ?? "Unable to upload resumes.",
        errors,
      },
      { status: 400 }
    );
  }

  const snapshot = await getRecruiterResumeSnapshot({
    agencyId: context.agency.id,
    jobOrderId: jobId,
  });

  return NextResponse.json(
    {
      ok: true,
      createdSubmissionIds,
      errors,
      snapshot,
    },
    { status: errors.length ? 207 : 200 }
  );
}
