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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 pb-10 pt-[110]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Key questions</h1>
            <p className="mt-1 text-sm text-slate-600">
              These answers help us auto-fill your job applications accurately.
            </p>
          </div>

          <QuestionsClient />
        </div>
      </div>
    </div>
  );
}
