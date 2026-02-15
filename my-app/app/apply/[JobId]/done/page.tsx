import Link from "next/link";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

export default function DonePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <div className="rounded-2xl border bg-white p-8 shadow-sm text-center">
        <CheckCircleIcon className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Submitted!</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your application was sent into the apply pipeline.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
