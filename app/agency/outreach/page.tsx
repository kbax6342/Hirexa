import OutreachComposer from "@/app/components/recruiter/OutreachComposer";
import RecruiterShell from "@/app/components/recruiter/RecruiterShell";
import { getRecruiterOutreachOptions } from "@/app/lib/recruiter/queries";
import { requireRecruiterContextOrRedirect } from "@/app/lib/recruiter/server";

type PageProps = {
  searchParams?: Promise<{
    jobOrderId?: string;
    candidateId?: string;
    stage?: string;
  }>;
};

export default async function AgencyOutreachPage(props: PageProps) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const { agency } = await requireRecruiterContextOrRedirect("/agency/outreach");
  const { jobOrders, candidates } = await getRecruiterOutreachOptions(agency.id);

  return (
    <RecruiterShell agencyName={agency.name}>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
            Outreach
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Generate recruiter-ready messages in a few clicks
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Draft intros, screen invites, submission updates, interview follow-ups, and offer notes from recruiter context.
          </p>
        </div>
        <OutreachComposer
          jobOrders={JSON.parse(JSON.stringify(jobOrders))}
          candidates={JSON.parse(JSON.stringify(candidates))}
          initialSelection={{
            jobOrderId: searchParams?.jobOrderId ?? null,
            candidateId: searchParams?.candidateId ?? null,
            stage: searchParams?.stage ?? null,
          }}
        />
      </div>
    </RecruiterShell>
  );
}
