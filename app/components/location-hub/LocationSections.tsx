"use client";

import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AdzunaAttribution from "@/app/components/jobs/AdzunaAttribution";
import ListSectionSkeleton from "@/app/components/loading/ListSectionSkeleton";
import { storeJobDetailSummary } from "@/app/lib/jobs/clientDetailSummary";

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
  preferredState,
  states,
  n,
}: {
  preferredState?: string | null;
  states: string[];
  n: number;
}) {
  const router = useRouter();
  const [sections, setSections] = useState<LocationSection[]>([]);
  const [loading, setLoading] = useState(true);

  const effectiveStates = useMemo(() => {
    const seen = new Set<string>();

    return [preferredState, ...states]
      .map((value) => value?.trim() ?? "")
      .filter(Boolean)
      .filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [preferredState, states]);

  function handleAiAssistantApply(jobUrl: string) {
    const encodedUrl = encodeURIComponent(jobUrl);
    router.push(`/job-tools/ai-assistant/apply?jobUrl=${encodedUrl}`);
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const qs = new URLSearchParams({
          states: effectiveStates.join(","),
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
  }, [effectiveStates, n]);

  if (loading) {
    return (
      <ListSectionSkeleton
        className="mt-10"
        sectionCount={Math.max(effectiveStates.length, 1)}
        cardsPerSection={Math.max(n, 1)}
      />
    );
  }

  if (sections.length === 0) {
    return (
      <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        Live jobs are taking longer than expected right now. Try again in a moment.
      </div>
    );
  }

  return (
    <section className="mt-10 space-y-10">
      {sections.map((sec) => (
        <div key={sec.name}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{sec.name}</h2>
            <Link
              href={`/jobs/${encodeURIComponent(
                sec.name.toLowerCase().replace(/\s+/g, "-")
              )}?loc=${encodeURIComponent(sec.name)}`}
              className="text-md font-medium text-white hover:underline"
            >
              See all {sec.name} jobs
            </Link>
          </div>

          <div className="mt-5 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sec.jobs.map((job) => (
              <div
                key={job.id}
                className="flex h-full flex-col rounded-xl border border-border/60 bg-white p-5 backdrop-blur-xl transition"
              >
                <div className="flex flex-1 flex-col">
                  <Link
                    href={`/jobs/details/${job.id}`}
                    className="block font-semibold text-foreground text-gray-700 hover:underline"
                    onClick={() =>
                      storeJobDetailSummary("public", {
                        id: job.id,
                        source: "adzuna",
                        title: job.title,
                        company: job.company,
                        location: job.location,
                        posted: job.posted,
                        description: job.description,
                        jobUrl: job.jobUrl,
                      })
                    }
                  >
                    {job.title}
                  </Link>

                  <div className="mt-2 text-sm text-muted-foreground">
                    {job.company} - {job.location}
                  </div>

                  {job.pill ? (
                    <div className="mt-3 inline-flex rounded-md bg-background/40 px-2 py-1 text-xs font-medium text-white">
                      {job.pill}
                    </div>
                  ) : null}

                  {job.posted ? (
                    <div className="mt-3 text-xs text-muted-foreground">{job.posted}</div>
                  ) : null}

                  <AdzunaAttribution className="mt-3" />
                </div>

                <div className="mt-auto flex items-center gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => handleAiAssistantApply(job.jobUrl)}
                    className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    AI Assistant Apply
                  </button>

                  <a
                    href={job.jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Apply externally for ${job.title}`}
                    className="inline-flex items-center justify-center rounded-md border border-slate-300 p-3 text-slate-700 hover:bg-slate-100"
                  >
                    <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
