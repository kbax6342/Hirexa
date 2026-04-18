import RecruiterDashboardClient from "@/app/components/recruiter/RecruiterDashboardClient";
import RecruiterShell from "@/app/components/recruiter/RecruiterShell";
import { getOrCreateRecruiterProfile } from "@/app/lib/recruiter/profile";
import { getRecruiterDashboardSnapshot } from "@/app/lib/recruiter/queries";
import { requireRecruiterContextOrRedirect } from "@/app/lib/recruiter/server";

export default async function RecruiterDashboardPage() {
  const { agency, userId } = await requireRecruiterContextOrRedirect({
    callbackUrl: "/recruiter/dashboard",
  });
  const [{ summary, recentJobOrders, recentCandidates }, recruiterProfile] =
    await Promise.all([
      getRecruiterDashboardSnapshot(agency.id),
      getOrCreateRecruiterProfile({ userId, agency }),
    ]);

  return (
    <RecruiterShell agencyName={agency.name}>
      <RecruiterDashboardClient
        summary={JSON.parse(JSON.stringify(summary))}
        recentJobOrders={JSON.parse(JSON.stringify(recentJobOrders))}
        recentCandidates={JSON.parse(JSON.stringify(recentCandidates))}
        recruiterProfile={JSON.parse(JSON.stringify(recruiterProfile.profile))}
        recruiterProfileCompletion={recruiterProfile.completion}
        recruiterProfileChecklist={JSON.parse(
          JSON.stringify(recruiterProfile.checklist)
        )}
      />
    </RecruiterShell>
  );
}
