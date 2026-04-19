import RecruiterCandidatesClient from "@/app/components/recruiter/RecruiterCandidatesClient";
import RecruiterShell from "@/app/components/recruiter/RecruiterShell";
import { listRecruiterCandidates } from "@/app/lib/recruiter/queries";
import { requireRecruiterContextOrRedirect } from "@/app/lib/recruiter/server";

export default async function AgencyCandidatesPage() {
  const { agency } = await requireRecruiterContextOrRedirect("/agency/candidates");
  const candidates = await listRecruiterCandidates(agency.id);

  return (
    <RecruiterShell agencyName={agency.name}>
      <RecruiterCandidatesClient initialCandidates={JSON.parse(JSON.stringify(candidates))} />
    </RecruiterShell>
  );
}
