import Link from "next/link";
import { auth } from "@/auth";

export default async function PaywallPage() {
  const session = await auth();
  const isSignedIn = Boolean(session?.user);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eff6ff_45%,_#e2e8f0_100%)] px-6 py-24">
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white/95 p-10 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-700">
          Premium Access Required
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
          Unlock Hirexa premium tools
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          LinkedIn Outreach and Career Coach require an active trial, monthly, or yearly plan.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/plans"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            View Plans
          </Link>
          <Link
            href={isSignedIn ? "/dashboard" : "/login"}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            {isSignedIn ? "Back to Dashboard" : "Log In"}
          </Link>
        </div>
      </div>
    </div>
  );
}
