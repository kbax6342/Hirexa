import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

type Body = {
  packId?: string;
  resumeText?: string;
  notes?: string;
};

function generatePackContent(input: { resumeText: string; notes: string; jobTitle?: string | null; company?: string | null }) {
  const role = input.jobTitle || "the role";
  const company = input.company || "the company";

  return {
    optimizedResume: `Target role: ${role} at ${company}\n\nSummary:\n${input.resumeText.slice(0, 500)}\n\nKey improvements:\n- Lead with measurable outcomes\n- Match required skills to posting language\n- Tighten impact bullets for ATS readability`,
    coverLetter: `Dear Hiring Team,\n\nI am excited to apply for ${role} at ${company}. My experience aligns with the role requirements, and I can contribute immediately through strong execution and measurable outcomes.\n\nRelevant highlights:\n- Experience that matches your technical and business needs\n- Proven collaboration and communication across teams\n- Results-focused approach to delivery\n\nAdditional notes: ${input.notes || "N/A"}\n\nSincerely,\nCandidate`,
    interviewPrep: `Interview prep for ${role}:\n\n1) Tell me about yourself (role-specific version)\n2) Why ${company}?\n3) Key impact stories using STAR\n4) Metrics you improved and how\n5) Questions to ask the interviewer\n\nNotes to remember:\n${input.notes || "Focus on your most relevant wins."}`,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const packId = String(body.packId ?? "").trim();
    const resumeText = String(body.resumeText ?? "").trim();
    const notes = String(body.notes ?? "").trim();

    if (!packId) return NextResponse.json({ ok: false, error: "packId is required" }, { status: 400 });
    if (resumeText.length < 100) {
      return NextResponse.json({ ok: false, error: "Resume text must be at least 100 characters." }, { status: 400 });
    }

    const pack = await prisma.jobHunterPack.update({
      where: { id: packId },
      data: { status: "generating", resumeText, notes },
    });

    const generated = generatePackContent({
      resumeText,
      notes,
      jobTitle: pack.jobTitle,
      company: pack.company,
    });

    const updatedPack = await prisma.jobHunterPack.update({
      where: { id: packId },
      data: {
        status: "ready",
        optimizedResume: generated.optimizedResume,
        coverLetter: generated.coverLetter,
        interviewPrep: generated.interviewPrep,
        error: null,
      },
    });

    return NextResponse.json({ ok: true, pack: updatedPack });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to generate pack" }, { status: 500 });
  }
}
