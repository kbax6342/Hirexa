import { requirePaidAccess } from "@/app/lib/access";

export default async function CareerCoachPage() {
  await requirePaidAccess("/agents/career-coach");

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-semibold text-slate-900">Career Coach</h1>
      <p className="mt-4 text-slate-600">
        Your AI career coaching workspace is coming soon.
      </p>
    </main>
  );
}
