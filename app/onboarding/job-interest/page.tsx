"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";


interface Job {
  uuid: string;
  title: string;
}

const DEFAULT_TERM = "manager"; // ✅ default dropdown content on focus

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export default function JobSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Job[]>([]);
  const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draftSelectedTitles, setDraftSelectedTitles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const router = useRouter();


  const containerRef = useRef<HTMLDivElement | null>(null);

  const totalSelectedCount = useMemo(() => {
    return new Set([...selectedTitles, ...draftSelectedTitles]).size;
  }, [selectedTitles, draftSelectedTitles]);

  const draftRemaining = useMemo(
    () => Math.max(0, 5 - totalSelectedCount),
    [totalSelectedCount],
  );

    

  // ---- search behavior (debounced) ----
  useEffect(() => {
    // If user is typing, show dropdown & fetch debounced
    if (!showDropdown) return;
    const term = query.trim();
    const effectiveTerm = term.length > 0 ? term : DEFAULT_TERM;

    // If empty query, we still fetch default list (manager)
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/job-titles?q=${encodeURIComponent(effectiveTerm)}`);
        const data = await res.json().catch(() => null);

        // supports array OR {results: []}
        const list: Job[] = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
        setResults(list);
      } finally {
        setLoading(false);
      }
    }, term.length > 0 ? 300 : 0);

    return () => clearTimeout(timeout);
  }, [query, showDropdown]);

  useEffect(() => {
    fetch("/api/onboarding/start", { method: "POST" }).catch(console.error);
  }, []);
  

  // ---- close dropdown on outside click ----
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = containerRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const toggleTitle = (title: string) => {
    setSelectedTitles((prev) => {
      if (prev.includes(title)) {
        return prev.filter((t) => t !== title);
      }
      if (prev.length >= 5) return prev;
      return [...prev, title];
    });
  };

  const toggleDraftTitle = (title: string) => {
    setDraftSelectedTitles((prev) => {
      const exists = prev.includes(title);
      if (exists) return prev.filter((t) => t !== title);

      const combined = new Set([...selectedTitles, ...prev, title]);
      if (combined.size > 5) return prev;

      return [...prev, title];
    });
  };

  const handleDone = () => {
    if (draftSelectedTitles.length > 0) {
      setSelectedTitles((prev) => {
        const next = [...prev];
        for (const title of draftSelectedTitles) {
          if (next.includes(title)) continue;
          if (next.length >= 5) break;
          next.push(title);
        }
        return next;
      });
    }

    setDraftSelectedTitles([]);
    setShowDropdown(false);
  };
  

  // const handleNext = async () => {
  //   try {
  //     console.log("Saving job interests:", selectedJobs);
  
  //     const res = await fetch("/api/job-interests", 
  //     { method: "POST",
  //      headers: { "Content-Type": "application/json" },
  //      credentials: "include", 
  //      body: JSON.stringify({ jobs: selectedJobs }) 
  //     });

  
  //     const text = await res.text(); // ✅ always read raw first
  
  //     console.log("Save response:", {
  //       ok: res.ok,
  //       status: res.status,
  //       statusText: res.statusText,
  //       body: text,
  //     });
  
  //     if (!res.ok) {
  //       // If your API returns JSON, this will parse it; otherwise it'll fall back to the raw text.
  //       let parsed: any = null;
  //       try {
  //         parsed = text ? JSON.parse(text) : null;
  //       } catch {}
  //       throw new Error(parsed?.error ?? parsed?.message ?? text ?? "Save failed");
  //     }
  
  //     // ✅ only navigate AFTER successful save
  //     router.push("/onboarding/time-saved");
  //   } catch (e: any) {
  //     console.error("handleNext failed:", e?.message ?? e, e);
  //   }
  // };
  const handleNext = async () => {
    try {
      setSaving(true);
      const jobs = selectedTitles.map((title) => ({
        uuid: slugify(title),
        title,
      }));

      const res = await fetch("/api/job-interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobs }),
      });
  
      const text = await res.text();
  
      console.log("Step save response:", { ok: res.ok, status: res.status, body: text });
      if (!res.ok) {
        let parsed: { error?: string; message?: string } | null = null;
        try { parsed = text ? JSON.parse(text) : null; } catch {}
        throw new Error(parsed?.error ?? parsed?.message ?? text ?? "Save failed");
      }
  
      router.push("/onboarding/time-saved");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("handleNext failed:", message, error);
    } finally {
      setSaving(false);
    }
  };
  
  const handleBack = () => {
    console.log("Going back");
    router.back();
  };


  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-start px-6 pt-[150]">
        <div className="w-full max-w-xl ">
          <h1 className="text-4xl font-bold text-center text-gray-900 mb-3">
            What kind of jobs are you looking for?
          </h1>

          <p className="text-center text-gray-600 mb-8">
            We recommend up to 5 titles to get a great list of jobs.
          </p>

          {/* Input + Dropdown wrapper */}
          <div className="relative" ref={containerRef}>
            <label htmlFor="job-search" className="block text-sm font-medium text-gray-700 mb-2">
              Job title, keyword or category
            </label>

            <input
                id="job-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => {
                  // ✅ show dropdown even with empty input; will fetch DEFAULT_TERM
                  if (!showDropdown) {
                    setDraftSelectedTitles(selectedTitles);
                    setShowDropdown(true);
                  }
                }}
                placeholder="Project manager, marketing, driver, etc."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700 placeholder-gray-400"
              />


            {/* Dropdown */}
            {showDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                {/* Header / status */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900">
                    {query.trim().length > 0 ? `Results for “${query.trim()}”` : `Popular “${DEFAULT_TERM}” titles`}
                  </div>
                  <div className="text-xs text-gray-600">
                    {totalSelectedCount} of 5 selected
                  </div>
                </div>

                {/* Results */}
                <div className="max-h-60 overflow-y-auto">
                  {loading && (
                    <div className="px-4 py-3 text-sm text-gray-500">Loading…</div>
                  )}

                  {!loading && results.length === 0 && (
                    <div className="px-4 py-3 text-sm text-gray-500">
                      No results. Try a different keyword.
                    </div>
                  )}

                  {!loading &&
                    results.map((job) => {
                      const isSelected = draftSelectedTitles.includes(job.title);
                      const isDisabled = !isSelected && totalSelectedCount >= 5;
                      return (
                        <label
                          key={job.uuid}
                          className={`px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 flex items-center gap-3 ${
                            isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => !isDisabled && toggleDraftTitle(job.title)}
                            // onChange={(e) => setQuery(e.target.value)}
                            disabled={isDisabled}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                          />
                          <span className="text-gray-700 flex-1">{job.title}</span>
                        </label>
                      );
                    })}
                </div>

                {/* Footer controls */}
                <div className="p-3 border-t border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">{draftRemaining} more recommended</span>
                    {totalSelectedCount >= 5 && (
                      <span className="text-xs text-amber-600 font-medium">Maximum reached</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setDraftSelectedTitles([]);
                        // keep dropdown open showing defaults
                        setShowDropdown(true);
                      }}
                      className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-800 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Clear search
                    </button>

                    <button
                      type="button"
                      onClick={handleDone}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Selected Jobs Tags */}
          {selectedTitles.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {selectedTitles.map((title) => (
                <button
                  key={title}
                  onClick={() => toggleTitle(title)}
                  className="inline-flex items-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-full text-base font-medium hover:bg-blue-600 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400"
                  aria-label={`Remove ${title}`}
                  type="button"
                >
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{title}</span>
                </button>
              ))}

              {selectedTitles.length < 5 && (
                <span className="text-sm text-gray-500 self-center">
                  {5 - selectedTitles.length} more {5 - selectedTitles.length === 1 ? "title" : "titles"} recommended
                </span>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="px-6 py-6 flex justify-between items-center border-t border-gray-200">
        <div className="mx-auto min-w-9/12  md:min-w-11/12 flex justify-between ">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 px-6 py-3 text-black font-medium rounded-full border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>

        <button
          onClick={handleNext}
          disabled={selectedTitles.length === 0 || saving}
          className="px-8 py-3 rounded-full font-medium bg-black text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Next"}
        </button>

        </div>
     
      </footer>
    </div>
  );
}
