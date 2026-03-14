import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getOnboardingStatusForUser } from "@/app/lib/onboarding/status";

import QuestionsClient from "./questionsClient";

export default async function QuestionsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    redirect("/login");
  }

  const onboarding = await getOnboardingStatusForUser(userId);

  if (onboarding.completed) {
    redirect("/dashboard");
  }

  if (onboarding.nextPath && onboarding.nextPath !== "/questions") {
    redirect(onboarding.nextPath);
  }

  return <QuestionsClient />;
}
