import { auth } from "../../auth";
import { redirect } from "next/navigation";
import DashboardShell from "../components/dashboard/dashboardShell";
import JobMatchesLayout from "../components/dashboard/jobMatchesLayout";
import { getOnboardingStatusForUser } from "@/app/lib/onboarding/status";

export default async function Dashboard() {
  const session = await auth();
  if (!session) redirect("/login");
  const userId = (session.user as { id?: string } | undefined)?.id ?? null;

  const onboarding = await getOnboardingStatusForUser(userId);
  if (!onboarding.completed && onboarding.nextPath) {
    redirect(onboarding.nextPath);
  }

  return (
    <DashboardShell active="job-matches">
      <JobMatchesLayout />
    </DashboardShell>
  );
}
