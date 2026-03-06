"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ResumeParsingLoadingScreen from "@/app/components/loading/ResumeParsingLoadingScreen";

type Experience = {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  dateRange?: string | null;
  bullets: string[];
};

function normalizeExperience(raw: any, idx: number): Experience {
  return {
    id: String(raw?.id ?? `exp_${idx}`),
    title: String(raw?.title ?? ""),
    company: String(raw?.company ?? ""),
    location: raw?.location ?? null,
    dateRange: raw?.dateRange ?? null,
    bullets: Array.isArray(raw?.bullets)
      ? raw.bullets.filter((b: any) => typeof b === "string")
      : [],
  };
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export default function Step2ResumeClient() {
  const params = useSearchParams();
  const resumeId = params.get("resumeId");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const hasResults = experiences.length > 0;


  useEffect(() => {
    if (!resumeId) {
      setError("Missing resumeId. Please upload your resume again.");
      setExperiences([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/resume/experience?resumeId=${encodeURIComponent(resumeId)}`,
          { cache: "no-store" }
        );

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load resume experience.");
        }

        const raw = Array.isArray(data?.experiences) ? data.experiences : [];
        const normalized = raw.map((r: any, idx: number) => normalizeExperience(r, idx));

        if (!cancelled) setExperiences(normalized);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Something went wrong.");
          setExperiences([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  const stepBar = useMemo(() => {
    return (
      <div className="flex items-center gap-10 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-600 text-sm font-semibold text-white">
            ✓
          </div>
          <div className="text-xs">
            <div className="font-semibold text-gray-700">STEP 1</div>
            <div className="text-gray-900">Key questions</div>
          </div>
        </div>

        <div className="h-[3px] flex-1 rounded bg-gray-200">
          <div className="h-[3px] w-1/2 rounded bg-green-600" />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-green-600 text-sm font-semibold text-green-700">
            2
          </div>
          <div className="text-xs">
            <div className="font-semibold text-gray-700">STEP 2</div>
            <div className="text-gray-900">Resume review</div>
          </div>
        </div>

        <div className="h-[3px] flex-1 rounded bg-gray-200" />

        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-sm font-semibold text-gray-600">
            3
          </div>
          <div className="text-xs">
            <div className="font-semibold text-gray-500">STEP 3</div>
            <div className="text-gray-500">Finalize</div>
          </div>
        </div>
      </div>
    );
  }, []);

  return loading ? (
    <ResumeParsingLoadingScreen />
  ) : (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-5xl px-6 pb-16">
        {stepBar}

        <div className="pt-10 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Work experience</h1>
          {resumeId && (
            <div className="text-xs text-gray-500">
              Resume ID: <span className="font-mono">{resumeId}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && !hasResults && (
          <p className="mt-6 text-sm text-gray-600">
            No work experience found for this resume.
          </p>
        )}

        <div className="mt-6 space-y-5">
          {experiences.map((exp, i) => {
            const isOpen = Boolean(expanded[exp.id]);
            const bulletsToShow = isOpen ? exp.bullets : exp.bullets.slice(0, 3);

            return (
              <div key={exp.id} className="rounded-xl border bg-white">
                <div className="flex items-start gap-4 px-5 py-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold">
                    {i + 1}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-blue-800">
                          {exp.title} <span className="text-gray-800">|</span>{" "}
                          <span className="text-gray-900">{exp.company}</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          {exp.location ? `${exp.location} | ` : ""}
                          {exp.dateRange ?? ""}
                        </div>
                      </div>

                      <div className="flex gap-3 text-blue-700">
                        <button className="rounded-md p-2 hover:bg-blue-50">
                          <PencilIcon />
                        </button>
                        <button className="rounded-md p-2 hover:bg-blue-50">
                          <TrashIcon />
                        </button>
                      </div>
                    </div>

                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
                      {bulletsToShow.map((b, idx) => (
                        <li className="text-black" key={idx}>{b}</li>
                      ))}
                    </ul>

                    {exp.bullets.length > 3 && (
                      <button
                        onClick={() => setExpanded((p) => ({ ...p, [exp.id]: !isOpen }))}
                        className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-blue-700"
                      >
                        {isOpen ? "Show Less" : "Show More"}
                        <span className={isOpen ? "rotate-180 transition" : "transition"}>
                          <ChevronDown />
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex items-center justify-between">
          <Link href="/questions/step2" className="rounded-full border px-6 py-3 text-sm font-semibold text-black">
            Back
          </Link>

          <Link href="/onboarding/job-interest" className="rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white">
            Next
          </Link>
        </div>
      </main>
    </div>
  );
}
