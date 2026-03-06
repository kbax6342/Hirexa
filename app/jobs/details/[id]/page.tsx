"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  MapPin,
  Building2,
  DollarSign,
  Briefcase,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";

type JobDetails = {
  id: string;
  title?: string;
  company?: string;
  companyName?: string;
  location?: string;
  posted?: string;
  jobUrl?: string;
  url?: string;
  description?: string;
  descriptionText?: string;
  compensation?: string;
  schedule?: string;
  remote?: string;
  benefits?: string[];
};

function formatPosted(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function fallbackCompanyInitial(company?: string) {
  const c = (company ?? "").trim();
  return c ? c[0].toUpperCase() : "•";
}

function safeText(s?: string) {
  return (s ?? "").trim();
}

export default function JobDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<JobDetails | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch(`/api/adzuna/details?id=${encodeURIComponent(id)}`, {
          cache: "no-store",
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load details");

        if (!cancelled) setData(json);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const title = useMemo(() => safeText(data?.title) || "Job Details", [data?.title]);
  const company = useMemo(
    () => safeText(data?.company || data?.companyName) || "Unknown company",
    [data?.company, data?.companyName]
  );
  const location = useMemo(() => safeText(data?.location) || "Unknown location", [data?.location]);
  const postedPretty = useMemo(() => formatPosted(data?.posted), [data?.posted]);
  const jobUrl = useMemo(() => safeText(data?.jobUrl || data?.url), [data?.jobUrl, data?.url]);

  const compensation = safeText(data?.compensation);
  const schedule = safeText(data?.schedule);
  const remote = safeText(data?.remote);
  const description = safeText(data?.description || data?.descriptionText) || "No description available.";

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <nav className="pt-6 text-sm text-slate-600">
          <Link href="/" className="font-semibold text-blue-800 hover:underline">
            Home
          </Link>
          <span className="mx-2 text-slate-400">›</span>
          <Link href="/jobs" className="font-semibold text-blue-800 hover:underline">
            All Job Categories
          </Link>
        </nav>

        {loading && <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm">Loading…</div>}

        {!loading && err && (
          <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{err}</div>
        )}

        {!loading && data && (
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <section>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 ring-1 ring-slate-200">
                    <span className="text-sm font-semibold text-slate-700">{fallbackCompanyInitial(company)}</span>
                  </div>

                  <div className="min-w-0">
                    <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{title}</h1>

                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {company}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {location}
                      </span>
                      {compensation && (
                        <span className="inline-flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          {compensation}
                        </span>
                      )}
                    </div>

                    {postedPretty && (
                      <div className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500">
                        <CalendarDays className="h-4 w-4" />
                        Posted {postedPretty}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Overview</div>
                  <ChevronDown className="h-5 w-5 text-slate-500" />
                </div>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  {schedule && (
                    <div className="flex gap-3">
                      <Briefcase className="h-5 w-5 text-slate-500" />
                      <div>
                        <div className="text-xs font-semibold">Schedule</div>
                        <div className="text-sm">{schedule}</div>
                      </div>
                    </div>
                  )}

                  {remote && (
                    <div className="flex gap-3">
                      <MapPin className="h-5 w-5 text-slate-500" />
                      <div>
                        <div className="text-xs font-semibold">Remote</div>
                        <div className="text-sm">{remote}</div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="mt-10">
                <h2 className="text-sm font-semibold text-slate-900">Job Description</h2>

                <div className="mt-4 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
                  <div className="text-lg font-semibold">Full Description</div>
                  <div className="mt-1 text-sm text-slate-600">{title}</div>

                  <div className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-700">{description}</div>
                </div>
              </section>

              <div className="mt-10">
                <Link href="/jobs" prefetch={false} className="text-sm text-black hover:underline">
                  ← Back to Jobs
                </Link>
              </div>
            </div>

            <aside className="lg:sticky lg:top-24 lg:h-fit">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
                <h2 className="text-base font-semibold text-slate-900">Want a tailored application for this job?</h2>
                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />ATS Resume Rewrite</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Tailored Cover Letter</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Interview Prep</li>
                </ul>
                <p className="mt-4 text-2xl font-bold text-slate-900">$29</p>
                <Link
                  href={`/job-hunter-pack?jobId=${encodeURIComponent(id)}`}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Buy Job Hunter Pack
                </Link>
                {jobUrl && (
                  <a
                    href={jobUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-white"
                  >
                    Apply Externally ↗
                  </a>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
