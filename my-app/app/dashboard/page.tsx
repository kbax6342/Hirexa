import DashboardShell from "../components/dashboard/dashboardShell";
import JobMatchesLayout from "../components/dashboard/jobMatchesLayout";

export default async function Dashboard() {
  return (
    <DashboardShell active="job-matches">
      <JobMatchesLayout />
    </DashboardShell>
  );
}
