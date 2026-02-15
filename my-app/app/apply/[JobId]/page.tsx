import { getOrCreateDraft } from "@/app/lib/apply/draft";
import { APPLY_FIELDS, getMissingFields } from "@/app/lib/apply/fields";
import ApplyIntakeClient from "./ui/ApplyIntakeClient";

export default async function ApplyIntakePage({
  params,
  searchParams,
}: {
  params: { jobId: string };
  searchParams: { jobUrl?: string };
}) {
  const draft = await getOrCreateDraft(params.jobId, searchParams.jobUrl);

  const prefill = {
    fullName: draft.fullName,
    email: draft.email,
    phone: draft.phone,
    location: draft.location,
    workAuth: draft.workAuth,
    linkedin: draft.linkedin,
    portfolio: draft.portfolio,
  };

  const missingRequired = getMissingFields(prefill);

  return (
    <ApplyIntakeClient
      jobId={params.jobId}
      draftId={draft.id}
      jobUrl={draft.jobUrl}
      fields={APPLY_FIELDS}
      missingRequiredKeys={missingRequired.map((m) => m.key)}
      prefill={prefill}
    />
  );
}
