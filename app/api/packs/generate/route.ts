import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

type GenerateBody = {
  packId?: string;
  resumeText?: string;
  notes?: string;
};

function generatePlaceholderPack(input: { jobTitle?: string | null; company?: string | null; resumeText: string; notes?: string }) {
  const header = `${input.jobTitle ?? "Target Role"}${input.company ? ` at ${input.company}` : ""}`;
  const notesPart = input.notes?.trim() ? `\n\nAdditional notes: ${input.notes.trim()}` : "";

  return {
    optimizedResume: `Optimized Resume for ${header}\n\n- Summary tuned for ATS matching\n- Experience bullets rewritten with action + impact\n- Skills section aligned to job keywords\n\nSource resume excerpt:\n${input.resumeText.slice(0, 1200)}${notesPart}`,
    coverLetter: `Dear Hiring Team,\n\nI am excited to apply for ${header}. My background aligns closely with the requirements, and I can contribute quickly by bringing measurable outcomes and strong cross-functional collaboration.\n\nWhy I am a fit:\n- Relevant experience mapped to responsibilities\n- Clear ownership and measurable results\n- Strong communication and execution\n\nSincerely,\nCandidate`,
    interviewPrep: `Interview Prep for ${header}\n\n1) Tell me about yourself in 60 seconds.\n2) Why this role and company?\n3) A project where you improved a metric.\n4) A challenge and how you handled it.\n5) Questions to ask the interviewer:\n   - What does success look like in 90 days?\n   - What are the top priorities for this role?`,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateBody;
    const packId = String(body?.packId ?? "").trim();
    const resumeText = String(body?.resumeText ?? "").trim();
    const notes = String(body?.notes ?? "").trim();

    if (!packId) {
      return NextResponse.json({ ok: false, error: "packId is required" }, { status: 400 });
    }

    if (resumeText.length < 100) {
      return NextResponse.json(
        { ok: false, error: "Resume text must be at least 100 characters." },
        { status: 400 }
      );
    }

    const existing = await prisma.jobHunterPack.findUnique({ where: { id: packId } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Pack not found" }, { status: 404 });
    }

    await prisma.jobHunterPack.update({
      where: { id: packId },
      data: {
        status: "generating",
        resumeText,
        notes: notes || null,
        error: null,
      },
    });

    const generated = generatePlaceholderPack({
      jobTitle: existing.jobTitle,
      company: existing.company,
      resumeText,
      notes,
    });

    const pack = await prisma.jobHunterPack.update({
      where: { id: packId },
      data: {
        status: "ready",
        optimizedResume: generated.optimizedResume,
        coverLetter: generated.coverLetter,
        interviewPrep: generated.interviewPrep,
      },
    });

    return NextResponse.json({ ok: true, pack });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate pack";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
