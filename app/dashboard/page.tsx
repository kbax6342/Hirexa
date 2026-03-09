// app/dashboard/page.tsx
import Link from "next/link";
import { auth } from "../../auth";
import { redirect } from "next/navigation";
import DashboardShell from "../components/dashboard/dashboardShell";
import JobMatchesLayout from "../components/dashboard/jobMatchesLayout";
import { getSmartMatchSearchConfigForUser } from "../lib/jobs/smartMatchSearch";



export default async function Dashboard() {
    const session = await auth();
    if (!session) redirect("/login");

    const userId = session.user?.id;
    const smartMatchSearch = userId
      ? await getSmartMatchSearchConfigForUser(userId)
      : { searchQuery: "jobs", jobTitles: [], preferredLocation: null };

  return (
    <DashboardShell active="job-matches">
      <JobMatchesLayout
        searchQuery={smartMatchSearch.searchQuery}
        preferredLocation={smartMatchSearch.preferredLocation}
      />
    </DashboardShell>
  );
}
