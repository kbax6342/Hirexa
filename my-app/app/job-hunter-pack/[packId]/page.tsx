import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { PackEditor } from "./packEditor";

export default async function JobHunterPackDetailPage({
  params,
}: {
  params: Promise<{ packId: string }>;
}) {
  const { packId } = await params;

  const pack = await prisma.jobHunterPack.findUnique({
    where: { id: packId },
  });

  if (!pack) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <PackEditor pack={pack} />
    </main>
  );
}
