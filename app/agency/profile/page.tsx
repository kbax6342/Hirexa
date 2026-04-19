import RecruiterShell from "@/app/components/recruiter/RecruiterShell";
import RecruiterProfileCard from "@/app/recruiter/dashboard/components/RecruiterProfileCard";
import { getOrCreateRecruiterProfile } from "@/app/lib/recruiter/profile";
import { requireRecruiterContextOrRedirect } from "@/app/lib/recruiter/server";

export default async function AgencyProfilePage() {
  const { agency, userId } = await requireRecruiterContextOrRedirect({
    callbackUrl: "/agency/profile",
  });
  const recruiterProfile = await getOrCreateRecruiterProfile({ userId, agency });

  return (
    <RecruiterShell agencyName={agency.name}>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
            Recruiter Profile
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Recruiter Profile
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Manage agency details, recruiter identity, preferences, and workspace settings.
          </p>
        </div>

        <RecruiterProfileCard
          initialProfile={JSON.parse(JSON.stringify(recruiterProfile.profile))}
          initialCompletion={recruiterProfile.completion}
          initialChecklist={JSON.parse(JSON.stringify(recruiterProfile.checklist))}
        />
      </div>
    </RecruiterShell>
  );
}
