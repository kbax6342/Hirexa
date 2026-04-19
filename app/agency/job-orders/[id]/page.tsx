import { notFound } from "next/navigation";

import RecruiterJobOrderDetailClient from "@/app/components/recruiter/RecruiterJobOrderDetailClient";
import RecruiterShell from "@/app/components/recruiter/RecruiterShell";
import { getRecruiterJobOrderDetail } from "@/app/lib/recruiter/queries";
import { requireRecruiterContextOrRedirect } from "@/app/lib/recruiter/server";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export default async function AgencyJobOrderDetailPage(props: RouteProps) {
  const { id } = await props.params;
  const { agency } = await requireRecruiterContextOrRedirect(`/agency/job-orders/${id}`);
  const detail = await getRecruiterJobOrderDetail(agency.id, id);

  if (!detail) {
    notFound();
  }

  return (
    <RecruiterShell agencyName={agency.name}>
      <RecruiterJobOrderDetailClient
        jobOrder={JSON.parse(JSON.stringify({
          id: detail.id,
          title: detail.title,
          companyName: detail.companyName,
          location: detail.location,
          employmentType: detail.employmentType,
          salaryMin: detail.salaryMin,
          salaryMax: detail.salaryMax,
          description: detail.description,
          requiredSkills: detail.requiredSkills,
          preferredSkills: detail.preferredSkills,
          requiredYearsExperience: detail.requiredYearsExperience,
          status: detail.status,
          createdAt: detail.createdAt,
          updatedAt: detail.updatedAt,
        }))}
        initialMatches={JSON.parse(JSON.stringify(detail.matches))}
        initialSubmissions={JSON.parse(JSON.stringify(detail.submissions))}
      />
    </RecruiterShell>
  );
}
