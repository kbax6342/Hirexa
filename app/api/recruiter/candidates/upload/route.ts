import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { recruiterCandidateSelect } from "@/app/lib/recruiter/queries";
import { parseRecruiterCandidateInput } from "@/app/lib/recruiter/parseCandidateResume";
import { requireRecruiterAgencyForApi } from "@/app/lib/recruiter/server";

export const runtime = "nodejs";

function inferNameFromFileName(fileName: string | null) {
  const normalized = String(fileName ?? "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!normalized) return { firstName: null as string | null, lastName: null as string | null };

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return { firstName: normalized, lastName: null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export async function POST(req: Request) {
  const context = await requireRecruiterAgencyForApi();
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status });
  }

  const formData = await req.formData();
  const uploadedFile = formData.get("resume");
  const pastedText = String(formData.get("resumeText") ?? "").trim();

  if (!(uploadedFile instanceof File) && !pastedText) {
    return NextResponse.json(
      {
        ok: false,
        error: "Upload a resume file or paste resume text to create a candidate.",
      },
      { status: 400 }
    );
  }

  const parsed = await parseRecruiterCandidateInput({
    resumeText: pastedText || null,
    file:
      uploadedFile instanceof File
        ? {
            buffer: Buffer.from(await uploadedFile.arrayBuffer()),
            fileName: uploadedFile.name,
            mimeType: uploadedFile.type || "application/pdf",
          }
        : null,
  });

  const fallbackName = inferNameFromFileName(parsed.filename);

  const candidate = await prisma.recruiterCandidate.create({
    data: {
      agencyId: context.agency.id,
      firstName: parsed.firstName ?? fallbackName.firstName,
      lastName: parsed.lastName ?? fallbackName.lastName,
      email: parsed.email,
      phone: parsed.phone,
      location: parsed.location,
      headline: parsed.headline,
      resumeText: parsed.resumeText,
      skills: parsed.skills,
      yearsExperience: parsed.yearsExperience,
      source: parsed.source,
      files: {
        create: {
          filename:
            parsed.filename ??
            (parsed.source === "PASTE" ? "pasted-resume.txt" : "uploaded-resume"),
          mimeType: parsed.mimeType ?? (parsed.source === "PASTE" ? "text/plain" : "application/octet-stream"),
          rawText: parsed.resumeText,
        },
      },
    },
    select: recruiterCandidateSelect,
  });

  return NextResponse.json({
    ok: true,
    candidate,
    warning: parsed.warning,
  });
}
