import { auth } from "../../auth";
import { redirect } from "next/navigation";
import DashboardShell from "../components/dashboard/dashboardShell";
import JobMatchesLayout from "../components/dashboard/jobMatchesLayout";

export default async function Dashboard() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <DashboardShell active="job-matches">
      <JobMatchesLayout />
    </DashboardShell>
  );
}
