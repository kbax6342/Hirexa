import { notFound } from "next/navigation";

import RecruiterShell from "@/app/components/recruiter/RecruiterShell";
import { requireRecruiterContextOrRedirect } from "@/app/lib/recruiter/server";
import { getRecruiterResumeSnapshot } from "@/app/lib/resumes/recruiterResumeEvaluator";
import CandidatesPageClient from "@/app/recruiter/jobs/[jobId]/candidates/CandidatesPageClient";

type RouteProps = {
  params: Promise<{ jobId: string }>;
};

export default async function RecruiterJobCandidatesPage(props: RouteProps) {
  const { jobId } = await props.params;
  const { agency } = await requireRecruiterContextOrRedirect(
    `/recruiter/jobs/${jobId}/candidates`
  );
  const snapshot = await getRecruiterResumeSnapshot({
    agencyId: agency.id,
    jobOrderId: jobId,
  });

  if (!snapshot) {
    notFound();
  }

  return (
    <RecruiterShell agencyName={agency.name}>
      <CandidatesPageClient
        snapshot={JSON.parse(JSON.stringify(snapshot))}
      />
    </RecruiterShell>
  );
}
