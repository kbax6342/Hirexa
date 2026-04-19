import RecruiterDashboardClient from "@/app/components/recruiter/RecruiterDashboardClient";
import RecruiterShell from "@/app/components/recruiter/RecruiterShell";
import { getRecruiterDashboardSnapshot } from "@/app/lib/recruiter/queries";
import { requireRecruiterContextOrRedirect } from "@/app/lib/recruiter/server";

export default async function AgencyDashboardPage() {
  const { agency } = await requireRecruiterContextOrRedirect({
    callbackUrl: "/agency/dashboard",
  });
  const { summary, recentJobOrders, recentCandidates } =
    await getRecruiterDashboardSnapshot(agency.id);

  return (
    <RecruiterShell agencyName={agency.name}>
      <RecruiterDashboardClient
        summary={JSON.parse(JSON.stringify(summary))}
        recentJobOrders={JSON.parse(JSON.stringify(recentJobOrders))}
        recentCandidates={JSON.parse(JSON.stringify(recentCandidates))}
      />
    </RecruiterShell>
  );
}
