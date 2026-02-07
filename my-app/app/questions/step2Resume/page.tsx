// import Step2ResumeClient from "./step2ResumeClient";
// import { auth } from "../../../../my-app/auth";
// import { redirect } from "next/navigation";


// export default async function Step2Page() {
//     const session = await auth();
//   if (!session) redirect("/login");
//   return <Step2ResumeClient />;
// }


"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Experience = {
  id: string;
  title: string;
  company: string;
  location?: string;
  dateRange?: string;
  bullets: string[];
};

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
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const hasResults = experiences.length > 0;
  
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/resume/experience");
      if (!res.ok) return;
      const data = await res.json();
      setExperiences(data.experiences || []);
    })();
  }, []);
  
  const stepBar = useMemo(() => {
    return (
      <div className="flex items-center gap-10 pt-6">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-semibold">
            ✓
          </div>
          <div className="text-xs">
            <div className="font-semibold text-gray-700">STEP 1</div>
            <div className="text-gray-900">Key questions</div>
          </div>
        </div>

        <div className="flex-1 h-[3px] bg-gray-200 rounded">
          <div className="h-[3px] bg-green-600 rounded w-1/2" />
        </div>

        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-full border border-green-600 text-green-700 flex items-center justify-center text-sm font-semibold">
            2
          </div>
          <div className="text-xs">
            <div className="font-semibold text-gray-700">STEP 2</div>
            <div className="text-gray-900">Resume review</div>
          </div>
        </div>

        <div className="flex-1 h-[3px] bg-gray-200 rounded" />

        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-full border border-gray-300 text-gray-600 flex items-center justify-center text-sm font-semibold">
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

  async function handleParse() {
    if (!file) return;
    setLoading(true);
    setError(null);
  
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("debug", "1")
      const res = await fetch("/api/resume/parse", {
        method: "POST",
        body: fd,
      });
  
      //console.log(res);
      // ✅ Read body ONCE
      const raw = await res.text();
      console.log("RAW:", raw.slice(0, 500));
  
      // Try parse JSON (your API returns JSON)
      let data: any = null;
     
      try {
        data = JSON.parse(raw);
        console.log("DATA:", data);
      } catch {
        data = null;
      }
  
      if (!res.ok) {
        console.error("Parse failed:", data ?? raw);
  
        // Prefer server-provided JSON error fields if present
        const msg =
          data?.detail ||
          data?.details ||
          data?.error ||
          raw ||
          `Parse failed (${res.status})`;
  
        throw new Error(msg);
      }
  
      // ✅ success
      // Your API might return { experience } or { experiences }
      const experiencesFromApi = data?.experiences ?? data?.experience ?? [];
      setExperiences(experiencesFromApi);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
      setExperiences([]);
    } finally {
      setLoading(false);
    }
  }
  

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-5xl px-6 pb-16">
        {stepBar}

        <div className="mt-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Work experience</h1>

          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block text-sm rounded-r-sm py-2 px-2 text-black bg-blue-300"
            />
            <button
              onClick={handleParse}
              disabled={!file || loading}
              className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {loading ? "Parsing..." : "Upload & Parse"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!hasResults && (
          <p className="mt-6 text-sm text-gray-600">
            Upload your resume (PDF or DOCX). We’ll extract your work experience and show it here.
          </p>
        )}

        <div className="mt-6 space-y-5">
          {experiences.map((exp, i) => {
            const isOpen = Boolean(expanded[exp.id]);
            const bulletsToShow = isOpen ? exp.bullets : exp.bullets.slice(0, 3);
            const hasMore = exp.bullets.length > 3;

            return (
              <div key={exp.id} className="rounded-xl border border-gray-200 bg-white">
                <div className="flex items-start gap-4 px-5 py-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-sm font-semibold text-gray-700">
                    {i + 1}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-blue-800">
                          {exp.title}{" "}
                          <span className="text-gray-800">|</span>{" "}
                          <span className="text-gray-900">{exp.company}</span>
                        </div>

                        <div className="mt-1 text-xs text-gray-600">
                          {exp.location ? `${exp.location} | ` : ""}
                          {exp.dateRange ?? ""}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-blue-700">
                        <button
                          type="button"
                          className="rounded-md p-2 hover:bg-blue-50"
                          title="Edit (coming soon)"
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="rounded-md p-2 hover:bg-blue-50"
                          title="Delete (coming soon)"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>

                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-800">
                      {bulletsToShow.map((b, idx) => (
                        <li key={idx}>{b}</li>
                      ))}
                    </ul>

                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => setExpanded((p) => ({ ...p, [exp.id]: !isOpen }))}
                        className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-blue-700 hover:underline"
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
          <Link href="/questions" className="rounded-full border px-6 py-3 text-sm font-semibold">
            Back
          </Link>

          <Link
            href="/questions/step3"
            className="rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white"
          >
            Next
          </Link>
        </div>
      </main>
    </div>
  );
}
