"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

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
  location?: string;
  posted?: string;
  jobUrl?: string;
  description?: string;
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
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Error");
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
  const company = useMemo(() => safeText(data?.company) || "Unknown company", [data?.company]);
  const location = useMemo(() => safeText(data?.location) || "Unknown location", [data?.location]);
  const postedPretty = useMemo(() => formatPosted(data?.posted), [data?.posted]);

  const compensation = safeText(data?.compensation);
  const schedule = safeText(data?.schedule);
  const remote = safeText(data?.remote);
  const benefits = Array.isArray(data?.benefits) ? data?.benefits : [];

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-5xl px-4 pb-16">
        {/* Breadcrumb */}
        <nav className="pt-6 text-sm text-slate-600">
          <Link href="/" className="hover:underline text-blue-800 font-semibold">
            Home
          </Link>
          <span className="mx-2 text-slate-400">›</span>
          <Link href="/jobs" className="hover:underline text-blue-800 font-semibold">
            All Job Categories
          </Link>
        </nav>

        {/* Loading / Error */}
        {loading && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm">
            Loading…
          </div>
        )}

        {!loading && err && (
          <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
            {err}
          </div>
        )}

        {!loading && data && (
          <>
            {/* Header */}
            <section className="mt-6">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-md bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center">
                  <span className="text-sm font-semibold text-slate-700">
                    {fallbackCompanyInitial(company)}
                  </span>
                </div>

                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">
                    {title}
                  </h1>

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
                    <div className="mt-3 text-xs text-slate-500 inline-flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      Posted {postedPretty}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Promo (no buttons) */}
            <section className="mt-8 rounded-2xl border border-blue-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-slate-900">
                Automate your job search with Hirexa.
              </h2>

              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                <li className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  Submit 10× as many applications with less effort
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  Reclaim your time with AI-powered searching
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  We scan millions of openings for you
                </li>
              </ul>
            </section>

            {/* Overview */}
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex justify-between items-center">
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

            {/* Description */}
            <section className="mt-10">
              <h2 className="text-sm font-semibold text-slate-900">Job Description</h2>

              <div className="mt-4 rounded-2xl bg-white ring-1 ring-slate-200 p-6">
                <div className="text-lg font-semibold">Full Description</div>
                <div className="mt-1 text-sm text-slate-600">{title}</div>

                <div className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {data.description ?? "No description available."}
                </div>
              </div>
            </section>

            {/* Back */}
            <div className="mt-10">
              <Link href="/jobs" prefetch={false} className="text-sm text-black hover:underline">
                ← Back to Jobs
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
