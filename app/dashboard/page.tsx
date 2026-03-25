import { auth } from "../../auth";
import { redirect } from "next/navigation";
import DashboardShell from "../components/dashboard/dashboardShell";
import JobMatchesLayout from "../components/dashboard/jobMatchesLayout";
import { getOnboardingStatusForUser } from "@/app/lib/onboarding/status";
import { getSmartMatchSearchConfigForUser } from "@/app/lib/jobs/smartMatchSearch";

export default async function Dashboard() {
  const session = await auth();
  if (!session) redirect("/login");
  const userId = (session.user as { id?: string } | undefined)?.id ?? null;

  const onboarding = await getOnboardingStatusForUser(userId);
  if (!onboarding.completed && onboarding.nextPath) {
    redirect(onboarding.nextPath);
  }

  const smartMatchDefaults = userId
    ? await getSmartMatchSearchConfigForUser(userId)
    : null;
  const initialProfileFilters = smartMatchDefaults
    ? {
        query: smartMatchDefaults.searchQuery,
        location: smartMatchDefaults.preferredLocation ?? "",
        includeRemote: smartMatchDefaults.includeRemote,
      }
    : null;

  console.info("[SMART_INIT] dashboard Smart Matches defaults", {
    userId,
    personalInfoCity: smartMatchDefaults?.debug?.personalInfoCity ?? null,
    personalInfoState: smartMatchDefaults?.debug?.personalInfoState ?? null,
    resolvedProfileDefaultLocation:
      smartMatchDefaults?.debug?.resolvedProfileDefaultLocation ?? null,
    legacySmartMatchesPreferenceLocation:
      smartMatchDefaults?.debug?.legacySmartMatchesPreferenceLocation ?? null,
    finalDefaultLocationSource:
      smartMatchDefaults?.debug?.finalDefaultLocationSource ?? "fallback-empty",
    profileTargetRole: smartMatchDefaults?.searchQuery ?? null,
  });

  return (
    <DashboardShell active="job-matches">
      <JobMatchesLayout initialProfileFilters={initialProfileFilters} />
    </DashboardShell>
  );
}
