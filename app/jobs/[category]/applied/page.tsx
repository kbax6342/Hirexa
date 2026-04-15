import Link from "next/link";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

function decodeSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function JobAppliedPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const jobId = decodeSegment(category ?? "");

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-blue-100 bg-blue-50/70 px-6 py-5">
            <div className="inline-flex items-center gap-3 text-blue-700">
              <CheckCircleIcon className="h-8 w-8" />
              <span className="text-sm font-semibold uppercase tracking-[0.18em]">
                Application received
              </span>
            </div>
          </div>

          <div className="space-y-5 px-6 py-6 sm:px-8 sm:py-8">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
                Thank you for applying
              </h1>
              <p className="text-sm leading-6 text-gray-600 sm:text-base">
                Your application was submitted successfully. Hirexa will keep
                cheering you on while you move to the next step.
              </p>
            </div>

            {jobId ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Job ID
                </div>
                <div className="mt-1 break-all text-sm font-medium text-gray-800">
                  {jobId}
                </div>
              </div>
            ) : null}

            <p className="text-sm text-gray-500">We&apos;re rooting for you.</p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/jobs"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Back to Jobs
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
