// /app/onboarding/skills/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SkillApiResponse = { skills: string[] };

function normalizeSkill(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function dedupe(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const v = normalizeSkill(item);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function SkillsOnboardingPage() {
  const router = useRouter();

  const [selected, setSelected] = useState<string[]>([]);
  const [resumeSkills, setResumeSkills] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 150);

  const [options, setOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingOpts, setLoadingOpts] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);

  const count = selected.length;
  const minOk = count >= 3;
  const maxOk = count <= 50;

  const selectedSet = useMemo(
    () => new Set(selected.map((s) => s.toLowerCase())),
    [selected]
  );

  // 1) Load resume-extracted skills once
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/onboarding/resume-skills", {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await res.json()) as SkillApiResponse;

        if (cancelled) return;

        const incoming = dedupe(data.skills ?? []).slice(0, 50);
        setResumeSkills(incoming);

        const prefill = incoming.slice(0, 10);
        const next = dedupe(prefill).slice(0, 50);
        setSelected(next);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Fetch options based on query
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingOpts(true);
      try {
        const url = debouncedQuery
          ? `/api/onboarding/skills?q=${encodeURIComponent(debouncedQuery)}&limit=12`
          : `/api/onboarding/skills?limit=12`;

        const res = await fetch(url, { cache: "no-store", credentials: "include" });
        const raw = await res.json();

        if (cancelled) return;

        const skillsFromApi: string[] = Array.isArray(raw)
          ? raw.map(String)
          : Array.isArray(raw?.skills)
          ? raw.skills.map(String)
          : [];

        const filtered = skillsFromApi.filter(
          (s) => !selectedSet.has(String(s).toLowerCase())
        );
        setOptions(filtered);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoadingOpts(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, selectedSet]);

  // Close dropdown on outside click
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function addSkill(skill: string) {
    setError(null);
    if (selected.length >= 50) return;

    const next = dedupe([...selected, skill]).slice(0, 50);
    setSelected(next);
    setQuery("");
    setOpen(true);
  }

  function removeSkill(skill: string) {
    setError(null);
    setSelected(selected.filter((s) => s.toLowerCase() !== skill.toLowerCase()));
  }

  async function onSave() {
    setError(null);

    const finalSkills = dedupe(selected).slice(0, 50);

    if (finalSkills.length < 3) {
      setError("Please select at least 3 skills.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ skills: finalSkills }),
      });

      const rawText = await res.text();
      let parsed: any = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {}

      if (!res.ok) {
        setError(parsed?.error ?? rawText ?? "Failed to save skills.");
        return;
      }

      router.push("/onboarding/job-alerts");
    } catch {
      setError("Failed to save skills.");
    } finally {
      setSaving(false);
    }
  }

  return (
    // ✅ flex-col layout so footer can stick to bottom of screen
    <div className="min-h-screen bg-white flex flex-col">
      {/* ✅ flex-1 makes content take available space */}
      <main className="mx-auto w-full max-w-3xl px-6 pb-24 pt-[100px] flex-1">
        {/* Heading */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            What skills should we match you with?
          </h1>
          <p className="mt-3 text-md text-slate-500">
            Choose at least <span className="font-semibold">3</span> skills (up to{" "}
            <span className="font-semibold">50</span>). We’ll use these to improve your matches.
          </p>
        </div>

        {/* Input + Dropdown */}
        <div ref={boxRef} className="mt-10">
          <label className="block font-bold text-2xl text-slate-700">
            Search skills
          </label>

          <div className="relative mt-2">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Type a skill (e.g., React, Customer Service, SQL)"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
            />

            {open && (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="text-xs font-medium text-slate-500">
                    {query ? "Results" : "Popular skills"}
                  </div>
                  {loadingOpts && <div className="text-xs text-slate-400">Loading…</div>}
                </div>

                <div className="max-h-72 overflow-auto">
                  {options.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-slate-500">
                      {query ? "No matches found." : "No suggestions."}
                    </div>
                  ) : (
                    options.map((s) => {
                      const isSelected = selectedSet.has(s.toLowerCase());
                      const atMax = selected.length >= 50;
                      const disabled = isSelected || atMax;

                      return (
                        <button
                          key={s}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            if (disabled) return;
                            addSkill(s);
                          }}
                          className={[
                            "flex w-full items-center justify-between px-4 py-3 text-left text-sm",
                            disabled
                              ? "cursor-not-allowed "
                              : "text-slate-800 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <span className="text-black">{s}</span>
                          <span className="text-xs text-slate-900">
                            {isSelected ? "Selected" : atMax ? "Max" : "Add"}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                  Tip: click to add. Max 50 skills.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Selected skills */}
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-800">
              Selected skills <span className="text-slate-500">({count}/50)</span>
            </div>
            {count < 3 ? (
              <div className="text-xs font-medium text-amber-600">
                Select {3 - count} more
              </div>
            ) : (
              <div className="text-xs font-medium text-emerald-600">Ready</div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {selected.length === 0 ? (
              <div className="text-sm text-slate-500">No skills selected yet.</div>
            ) : (
              selected.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => removeSkill(s)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-800 hover:bg-slate-100"
                  title="Remove"
                >
                  <span>{s}</span>
                  <span className="text-slate-400">×</span>
                </button>
              ))
            )}
          </div>

          {resumeSkills.length > 0 && (
            <div className="mt-3 text-xs text-slate-500">
              Prefilled from resume: {resumeSkills.slice(0, 8).join(", ")}
              {resumeSkills.length > 8 ? "…" : ""}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </main>

      {/* ✅ Sticky footer with top border like other pages */}
      <footer className="sticky bottom-0 w-full border-t border-gray-200 bg-white">
        <div className="mx-auto w-full   px-6 py-6">
          {/* mobile: 9/12, md+: 11/12 (per your request) */}
          <div className="mx-auto w-9/12 md:w-11/12 flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 px-6 py-3 text-black font-medium rounded-full border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={saving || !minOk || !maxOk}
              className="px-8 py-3 rounded-full font-medium text-white disabled:opacity-50 disabled:bg-black bg-[#145efc] hover:bg-[#0f4ed6]"
            >
              {saving ? "Saving..." : "Next"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
