import { redirect } from "next/navigation";

import { auth } from "@/auth";
import HirePilotClient from "@/app/job-tools/agents/hirepilot/HirePilotClient";

export default async function HirePilotPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <HirePilotClient />;
}
