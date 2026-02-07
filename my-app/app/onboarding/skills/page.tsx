// src/app/onboarding/skills/page.tsx
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

  const selectedSet = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected]);

  // 1) Load resume-extracted skills once
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/onboarding/resume-skills", { cache: "no-store" });
        const data = (await res.json()) as SkillApiResponse;

        if (cancelled) return;

        const incoming = dedupe(data.skills ?? []).slice(0, 50);
        setResumeSkills(incoming);

        // Auto-select resume skills (but don’t force to 50; keep it reasonable)
        // You asked: “only put a minimum of 3 skills” → we’ll prefill up to 10 max,
        // but ensure at least 3 if available.
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

  // 2) Fetch options based on query (empty query => popular skills)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingOpts(true);
      try {
        const url = debouncedQuery
        ? `/api/onboarding/skills?q=${encodeURIComponent(debouncedQuery)}&limit=12`
        : `/api/onboarding/skills?limit=12`;
      
        const res = await fetch(url, { cache: "no-store" });
        const raw = await res.json();
      console.log("CLIENT /api/onboarding/skills raw:", raw);

      // ✅ support BOTH response shapes:
      // 1) ["a","b"]
      // 2) { skills: ["a","b"] }
     


     

        if (cancelled) return;

        // Remove anything already selected from options list
        const skillsFromApi: string[] = Array.isArray(raw)
        ? raw.map(String)
        : Array.isArray(raw?.skills)
        ? raw.skills.map(String)
        : [];

      setOptions(skillsFromApi);

        //console.log("options set to:", filtered);

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

    const next = dedupe([...selected, skill]).slice(0, 50);

    // If we hit max, don’t add more
    if (selected.length >= 50) return;

    setSelected(next);
    setQuery("");
    setOpen(true); // keep open so user can keep adding
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
        body: JSON.stringify({ skills: finalSkills }),
      });

      const data = await res.json().catch(() => null);
      
      if (!res.ok) {
        setError(data?.error ?? "Failed to save skills.");
        return;
      }

      // Go next step (change to your actual next route)
      router.push("/onboarding/job-alerts");
    } catch {
      setError("Failed to save skills.");
    } finally {
      setSaving(false);
    }
  }
 

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-gray-900">Add your skills</h1>
        <p className="mt-2 text-sm text-gray-600">
          Choose at least <strong>3</strong> skills (up to <strong>50</strong>). We’ve prefilled skills from your resume if available.
        </p>

        {/* Selected pills */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-800">
              Selected skills <span className="text-gray-500">({count}/50)</span>
            </div>
            {!minOk && <div className="text-xs text-amber-600">Select {3 - count} more</div>}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {selected.length === 0 ? (
              <div className="text-sm text-gray-500">No skills selected yet.</div>
            ) : (
              selected.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => removeSkill(s)}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-800 hover:bg-gray-100"
                  title="Remove"
                >
                  <span>{s}</span>
                  <span className="text-gray-400">×</span>
                </button>
              ))
            )}
          </div>

          {/* Optional: show where these came from */}
          {resumeSkills.length > 0 && (
            <div className="mt-3 text-xs text-gray-500">
              Prefilled from resume: {resumeSkills.slice(0, 8).join(", ")}
              {resumeSkills.length > 8 ? "…" : ""}
            </div>
          )}
        </div>

        {/* Search box + dropdown */}
        <div ref={boxRef} className="relative mt-6">
          <label className="block text-sm font-medium text-gray-800">Search skills</label>
          <input
           suppressHydrationWarning
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Type a skill (e.g., React, Customer Service, SQL)"
            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/10"
          />

          {open && (
            <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="text-xs font-medium text-gray-600">
                  {query ? "Results" : "Popular skills"}
                </div>
                {loadingOpts && <div className="text-xs text-gray-400">Loading…</div>}
              </div>

              <div className="max-h-72 overflow-auto">
                {options.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-gray-500">
                    {query ? "No matches found." : "No suggestions."}
                  </div>
                ) : (
                  // options.map((s) => {
                  //   const atMax = selected.length >= 50;
                  //   return (
                  //     <button
                  //       key={s}
                  //       type="button"
                  //       onClick={() => addSkill(s)}
                  //       disabled={atMax}
                  //       className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  //     >
                  //       <span>{s}</span>
                  //       <span className="text-xs text-gray-400">Add</span>
                  //     </button>
                  //   );
                  // })
                  options.map((s) => {
                    const isSelected = selectedSet.has(s.toLowerCase());
                    const atMax = selected.length >= 50;
                  
                    // disable if already selected OR max reached
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
                        className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm
                          ${disabled ? "cursor-not-allowed opacity-50" : "text-gray-800 hover:bg-gray-50"}`}
                      >
                        <span className="text-gray-800">{s}</span>
                  
                        <span className="text-xs text-gray-400">
                          {isSelected ? "Selected" : atMax ? "Max" : "Add"}
                        </span>
                      </button>
                    );
                  })
                  
                )}
              </div>

              <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
                Tip: click to add. Max 50 skills.
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Save / Next */}
        <div className="mt-8 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !minOk || !maxOk}
            className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
