import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import PackEditor from "./packEditor";

type Props = {
  params: Promise<{ packId: string }>;
};

export default async function JobHunterPackPage({ params }: Props) {
  const { packId } = await params;

  const pack = await prisma.jobHunterPack.findUnique({ where: { id: packId } });
  if (!pack) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <PackEditor
        initialPack={{
          id: pack.id,
          jobTitle: pack.jobTitle,
          company: pack.company,
          jobUrl: pack.jobUrl,
          status: pack.status,
          resumeText: pack.resumeText,
          notes: pack.notes,
          optimizedResume: pack.optimizedResume,
          coverLetter: pack.coverLetter,
          interviewPrep: pack.interviewPrep,
        }}
      />
    </main>
  );
}
