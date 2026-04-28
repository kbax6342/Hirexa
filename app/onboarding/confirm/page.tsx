import { redirect } from "next/navigation";

import { auth } from "@/auth";
import OnboardingEmailConfirmationStep from "@/app/components/onboarding/OnboardingEmailConfirmationStep";
import { getOnboardingStatusForUser } from "@/app/lib/onboarding/status";

export default async function OnboardingConfirmPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    redirect("/login?callbackUrl=/onboarding/confirm");
  }

  const onboarding = await getOnboardingStatusForUser(userId);

  if (onboarding.completed) {
    redirect("/dashboard");
  }

  if (!onboarding.formCompleted && onboarding.nextPath) {
    redirect(onboarding.nextPath);
  }

  return (
    <OnboardingEmailConfirmationStep
      email={session?.user?.email ? String(session.user.email) : null}
    />
  );
}
