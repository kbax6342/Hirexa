import { prisma } from "@/app/lib/prisma";
import SubmitClient from "./ui/SubmitClient";

export default async function ReviewPage({ params }: { params: { jobId: string } }) {
  // NOTE: In production, scope this to the current user/guest too
  const draft = await prisma.applicationDraft.findFirst({
    where: { jobId: params.jobId },
    orderBy: { updatedAt: "desc" },
  });

  if (!draft) {
    return <div className="p-8">No draft found.</div>;
  }

  const items = [
    ["Full name", draft.fullName],
    ["Email", draft.email],
    ["Phone", draft.phone],
    ["Location", draft.location],
    ["Work authorization", draft.workAuth],
    ["LinkedIn", draft.linkedin],
    ["Portfolio", draft.portfolio],
  ] as const;

  return <SubmitClient jobId={params.jobId} draftId={draft.id} items={items} />;
}
