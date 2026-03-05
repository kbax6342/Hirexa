import Link from "next/link";
import { Navbar } from "./components/navbar";
import { Footer } from "./components/footer";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 pb-16 pt-32">
        <section className="rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-8 sm:p-12">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Hirexa Product</p>
          <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Apply with a complete package built for each job
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
            ATS resume rewrite + tailored cover letter + interview prep — for a specific job.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/job-hunter-pack"
              className="inline-flex items-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Get Job Hunter Pack
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Browse Jobs
            </Link>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Job Hunter Pack $29</h2>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li>• ATS-optimized resume rewrite for the exact role</li>
                <li>• Tailored cover letter aligned to the job requirements</li>
                <li>• Interview prep questions + talking points</li>
              </ul>
            </div>

            <Link
              href="/job-hunter-pack"
              className="inline-flex items-center rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              Get Pack
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
