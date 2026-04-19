import RecruiterJobOrdersClient from "@/app/components/recruiter/RecruiterJobOrdersClient";
import RecruiterShell from "@/app/components/recruiter/RecruiterShell";
import { listRecruiterJobOrders } from "@/app/lib/recruiter/queries";
import { requireRecruiterContextOrRedirect } from "@/app/lib/recruiter/server";

export default async function AgencyJobOrdersPage() {
  const { agency } = await requireRecruiterContextOrRedirect("/agency/job-orders");
  const jobOrders = await listRecruiterJobOrders(agency.id);

  return (
    <RecruiterShell agencyName={agency.name}>
      <RecruiterJobOrdersClient initialJobOrders={JSON.parse(JSON.stringify(jobOrders))} />
    </RecruiterShell>
  );
}
