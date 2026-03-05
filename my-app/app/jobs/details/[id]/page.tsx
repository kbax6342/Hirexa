"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { MapPin, Building2, DollarSign, Briefcase, CalendarDays, ChevronDown } from "lucide-react";

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
};

function formatPosted(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const safe = (v?: string) => (v ?? "").trim();

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
        const res = await fetch(`/api/adzuna/details?id=${encodeURIComponent(id)}`, { cache: "no-store" });
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

  const title = useMemo(() => safe(data?.title) || "Job Details", [data?.title]);
  const company = useMemo(() => safe(data?.company || data?.companyName) || "Unknown company", [data?.company, data?.companyName]);
  const location = useMemo(() => safe(data?.location) || "Unknown location", [data?.location]);
  const postedPretty = useMemo(() => formatPosted(data?.posted), [data?.posted]);
  const externalUrl = data?.jobUrl || data?.url;

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <nav className="pt-6 text-sm text-slate-600">
          <Link href="/" className="font-semibold text-blue-800 hover:underline">Home</Link>
          <span className="mx-2 text-slate-400">›</span>
          <Link href="/jobs" className="font-semibold text-blue-800 hover:underline">All Job Categories</Link>
        </nav>

        {loading && <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm">Loading…</div>}
        {!loading && err && <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{err}</div>}

        {!loading && data && (
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <section>
                <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{title}</h1>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4" />{company}</span>
                  <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" />{location}</span>
                  {safe(data.compensation) && <span className="inline-flex items-center gap-2"><DollarSign className="h-4 w-4" />{safe(data.compensation)}</span>}
                </div>
                {postedPretty && <div className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-4 w-4" />Posted {postedPretty}</div>}
              </section>

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Overview</div>
                  <ChevronDown className="h-5 w-5 text-slate-500" />
                </div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  {safe(data.schedule) && <div className="flex gap-3"><Briefcase className="h-5 w-5 text-slate-500" /><div><div className="text-xs font-semibold">Schedule</div><div className="text-sm">{safe(data.schedule)}</div></div></div>}
                  {safe(data.remote) && <div className="flex gap-3"><MapPin className="h-5 w-5 text-slate-500" /><div><div className="text-xs font-semibold">Remote</div><div className="text-sm">{safe(data.remote)}</div></div></div>}
                </div>
              </section>

              <section className="mt-8">
                <h2 className="text-sm font-semibold text-slate-900">Job Description</h2>
                <div className="mt-4 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
                  <div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{data.description || data.descriptionText || "No description available."}</div>
                </div>
              </section>

              <div className="mt-10"><Link href="/jobs" className="text-sm text-black hover:underline">← Back to Jobs</Link></div>
            </div>

            <aside className="h-fit rounded-2xl border border-emerald-200 bg-emerald-50 p-6 lg:sticky lg:top-6">
              <h3 className="text-lg font-semibold text-slate-900">Want a tailored application for this job?</h3>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li>• ATS Resume Rewrite</li>
                <li>• Tailored Cover Letter</li>
                <li>• Interview Prep</li>
              </ul>
              <div className="mt-5 text-3xl font-bold text-emerald-700">$29</div>
              <Link href={`/job-hunter-pack?jobId=${encodeURIComponent(id)}`} className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Buy Job Hunter Pack</Link>
              {externalUrl && (
                <a href={externalUrl} target="_blank" rel="noreferrer" className="mt-3 block text-center text-sm font-medium text-emerald-900 hover:underline">
                  Apply Externally ↗
                </a>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
