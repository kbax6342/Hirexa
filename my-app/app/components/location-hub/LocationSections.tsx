"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type JobCard = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  jobUrl: string;
  description?: string;
  pill?: string;
  logoText: string;
};

type LocationSection = {
  name: string;
  href: string;
  jobs: JobCard[];
};

export default function LocationSections({
  states,
  n,
}: {
  states: string[];
  n: number;
}) {
  const [sections, setSections] = useState<LocationSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const qs = new URLSearchParams({
          states: states.join(","),
          n: String(n),
        });

        const res = await fetch(`/api/adzuna/by-location?${qs.toString()}`);

        const contentType = res.headers.get("content-type") || "";
        if (!res.ok || !contentType.includes("application/json")) {
          const text = await res.text();
          console.error(
            "API returned non-JSON:",
            res.status,
            contentType,
            text.slice(0, 500)
          );
          if (!alive) return;
          setSections([]);
          return;
        }

        const data = await res.json();
        if (!alive) return;
        setSections(data.sections ?? []);
      } catch (err) {
        console.error("Failed to load sections", err);
        if (!alive) return;
        setSections([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [states, n]);

  if (loading) {
    return <div className="mt-10 text-sm text-gray-500">Loading jobs…</div>;
  }

  return (
    <section className="mt-10 space-y-10">
      {sections.map((sec) => (
        <div key={sec.name}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{sec.name}</h2>
            <Link
              href={sec.href}
              className="text-xs font-medium text-indigo-700 hover:underline"
            >
              See all {sec.name} jobs →
            </Link>
          </div>

          {/* ✅ Jobs-page-like cards + View job -> details */}
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sec.jobs.map((job) => (
              <div
                key={job.id}
                className="rounded-xl bg-white ring-1 ring-slate-200 p-5 hover:ring-slate-300 transition"
              >
                <Link
                  href={`/jobs/details/${job.id}`}
                  className="block font-semibold text-slate-900 hover:underline"
                >
                  {job.title}
                </Link>

                <div className="mt-2 text-sm text-slate-600">
                  {job.company} • {job.location}
                </div>

                {job.pill ? (
                  <div className="mt-3 inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                    {job.pill}
                  </div>
                ) : null}

                {job.posted ? (
                  <div className="mt-3 text-xs text-slate-500">{job.posted}</div>
                ) : null}

                <div className="mt-4 flex items-center gap-3">
                  <Link
                    href={`/jobs/details/${job.id}`}
                    className="text-blue-600 hover:underline font-medium text-sm"
                  >
                    View job
                  </Link>

                  {job.jobUrl ? (
                    <a
                      href={job.jobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-500 hover:text-slate-700 text-sm"
                    >
                      Open source →
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
