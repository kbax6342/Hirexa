import { auth } from "../../auth";
import { redirect } from "next/navigation";
import DashboardShell from "../components/dashboard/dashboardShell";
import JobMatchesLayout from "../components/dashboard/jobMatchesLayout";
import { prisma } from "@/app/lib/prisma";

export default async function Dashboard() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId =
    (session as any)?.user?.id ??
    (session as any)?.user?.userId ??
    null;

  if (!userId) redirect("/login");

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { registrationStatus: true },
  });

  // ✅ CHANGE THESE VALUES to match what you store in registrationStatus
  const hasActivePlan =
    profile?.registrationStatus === "PAID" ||
    profile?.registrationStatus === "ACTIVE" ||
    profile?.registrationStatus === "COMPLETED";

  return (
    <DashboardShell active="job-matches">
      <JobMatchesLayout hasActivePlan={hasActivePlan} />
    </DashboardShell>
  );
}
