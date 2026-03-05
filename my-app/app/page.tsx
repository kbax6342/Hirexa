import Link from "next/link";
import { Navbar } from "./components/navbar";
import { Footer } from "./components/footer";

const packIncludes = [
  "ATS resume rewrite for the target role",
  "Tailored cover letter aligned to job requirements",
  "Interview prep bullets focused on this exact position",
];

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-14">
        <section className="rounded-3xl border border-border/60 bg-card/40 p-8 backdrop-blur-xl md:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Hirexa</p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Apply with a complete package built for each job
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
            ATS resume rewrite + tailored cover letter + interview prep — for a specific job.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/job-hunter-pack"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Get Job Hunter Pack
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-lg border border-border/70 bg-background/30 px-5 py-3 text-sm font-semibold text-foreground hover:bg-background/50"
            >
              Browse Jobs
            </Link>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-emerald-200/40 bg-emerald-50/50 p-8 md:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Job Hunter Pack $29</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-700 md:text-base">
                {packIncludes.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Link
              href="/job-hunter-pack"
              className="inline-flex h-fit items-center justify-center rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Get Pack
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
