// app/onboarding/choose-workplace/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type LocationOption = {
  id: string; // stable id for list rendering
  label: string; // e.g. "Chicago, Illinois" or "Chicago, IL"
  lat?: number;
  lon?: number;
};

const MAX_LOCATIONS = 5;
const DEBOUNCE_MS = 600;

export default function ChooseWorkplacePage() {
  // selected pills (persisted in this page state)
  const [selected, setSelected] = useState<LocationOption[]>([]);
  const [includeRemote, setIncludeRemote] = useState(true);

  // search UI
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // dropdown results
  const [results, setResults] = useState<LocationOption[]>([]);
  const [draftSelectedIds, setDraftSelectedIds] = useState<Set<string>>(new Set());

  // loading + error
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // cancel in-flight search when typing
  const abortRef = useRef<AbortController | null>(null);

  // ---------- Helpers ----------
  const selectedLabels = useMemo(
    () => new Set(selected.map((s) => s.label.toLowerCase())),
    [selected]
  );
  const router = useRouter();

  function removePill(label: string) {
    setSelected((prev) => prev.filter((x) => x.label !== label));
  }

  function toggleDraft(id: string) {
    setDraftSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmDraft() {
    const chosen = results.filter((r) => draftSelectedIds.has(r.id));

    setSelected((prev) => {
      const next = [...prev];

      for (const c of chosen) {
        if (next.length >= MAX_LOCATIONS) break;
        if (next.some((x) => x.label.toLowerCase() === c.label.toLowerCase())) continue;
        next.push(c);
      }

      return next.slice(0, MAX_LOCATIONS);
    });

    setOpen(false);
    setQuery("");
    setResults([]);
    setDraftSelectedIds(new Set());
  }

  async function saveLocations() {
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        includeRemote,
        locations: selected.map((s) => ({
          label: s.label,
          lat: s.lat,
          lon: s.lon,
        })),
      }),
    });
  
    const text = await res.text();
    console.log("choose-workplace /locations raw:", { ok: res.ok, status: res.status, body: text });
  

  
    if (!res.ok) {
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch {}
      throw new Error(parsed?.error ?? parsed?.message ?? text ?? "Failed to save locations");
    }
  
    const parsed = text ? JSON.parse(text) : { ok: true };
    console.log("✅ PROOF locations saved:", parsed?.proof ?? parsed);
    return parsed;
  }

  // ---------- Auto-detect local city/state and add as first pill ----------
  useEffect(() => {
    let cancelled = false;

    async function detectLocal() {
      setLoadingLocal(true);
      setError(null);

      try {
        const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => reject(err),
            { enableHighAccuracy: false, timeout: 7000 }
          );
        });

        const res = await fetch(
          `/api/locations/reverse?lat=${coords.latitude}&lon=${coords.longitude}`,
          { cache: "no-store" }
        );

        const text = await res.text();
        const data = text ? JSON.parse(text) : {};

        if (!res.ok) throw new Error(data?.error ?? "Failed to resolve location");

        const label = String(data?.label ?? "").trim();
        if (!label) throw new Error("No local location found");

        if (cancelled) return;

        setSelected((prev) => {
          if (prev.some((x) => x.label.toLowerCase() === label.toLowerCase())) return prev;
          return [{ id: `local:${label}`, label }, ...prev].slice(0, MAX_LOCATIONS);
        });
      } catch {
        // If user blocks geo, just don't prefill. No error needed.
      } finally {
        if (!cancelled) setLoadingLocal(false);
      }
    }

    detectLocal();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Close dropdown on outside click ----------
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = containerRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // ---------- Debounced search (Nominatim-only route) ----------
  useEffect(() => {
    const q = query.trim();

    if (!open) return;

    // reset draft picks when typing new query
    setDraftSelectedIds(new Set());

    if (q.length < 2) {
      abortRef.current?.abort();
      setResults([]);
      setLoadingSearch(false);
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoadingSearch(true);
      setError(null);

      try {
        // IMPORTANT: route path must exist at app/api/locations/search/route.ts
        const res = await fetch(`/api/locations/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        const text = await res.text();
        const data = text ? JSON.parse(text) : {};

        if (!res.ok) {
          throw new Error(data?.error ?? `Search failed (${res.status})`);
        }

        const list: LocationOption[] = Array.isArray(data?.options) ? data.options : [];
        setResults(list);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message ?? "Search failed");
        setResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query, open]);

  useEffect(() => {
    console.log("🧭 Selected locations (client state):", selected);
  }, [selected]);
  
  useEffect(() => {
    console.log("🌐 includeRemote:", includeRemote);
  }, [includeRemote]);

  // how many more can be added (not counting already-selected items)
  const remaining = useMemo(() => Math.max(0, MAX_LOCATIONS - selected.length), [selected.length]);

  return (
    <div className="min-h-screen bg-white" ref={containerRef}>
      {/* top-left brand placeholder */}
      <div className="px-10 pt-8">
      </div>

      <main className="mx-auto mt-14 max-w-3xl px-6">
        <h1 className="text-center text-3xl font-semibold text-gray-900">
          Where do you want to work?
        </h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          Add multiple locations to cast a wider net.
        </p>

        <div className="mt-10">
          <label className="mb-2 block text-sm font-medium text-gray-700">City or state</label>

          {/* Input with pills inside */}
          <div
            className={[
              "relative rounded-xl border bg-white px-3 py-2 shadow-sm",
              open ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200",
            ].join(" ")}
            onMouseDown={() => {
              // keep focus behavior smooth
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              {selected.map((pill) => (
                <span
                  key={pill.id}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-800"
                >
                  {pill.label}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removePill(pill.label);
                    }}
                    className="rounded-full px-1 text-gray-500 hover:bg-gray-200 hover:text-gray-800"
                    aria-label={`Remove ${pill.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}

              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  setError(null);
                }}
                onFocus={() => setOpen(true)}
                placeholder={selected.length ? "" : "Search city or state..."}
                className="min-w-[160px] flex-1 border-0 bg-transparent py-1 text-sm text-gray-800 outline-none placeholder:text-gray-400"
              />
            </div>

            {/* Dropdown */}
            {open && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-xl border border-gray-200 bg-white shadow-lg">
                <div className="max-h-64 overflow-auto p-2">
                  {loadingSearch ? (
                    <div className="p-3 text-sm text-gray-500">Searching…</div>
                  ) : error ? (
                    <div className="p-3 text-sm text-red-600">{error}</div>
                  ) : results.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500">
                      {query.trim().length < 2
                        ? "Type at least 2 letters…"
                        : "No results."}
                    </div>
                  ) : (
                    <ul className="space-y-1">
                      {results.map((r) => {
                        const alreadyAdded = selectedLabels.has(r.label.toLowerCase());

                        // how many NEW items are currently drafted (not counting items already in selected)
                        const draftedNewCount = Array.from(draftSelectedIds).reduce((acc, id) => {
                          const opt = results.find((x) => x.id === id);
                          if (!opt) return acc;
                          if (selectedLabels.has(opt.label.toLowerCase())) return acc;
                          return acc + 1;
                        }, 0);

                        const wouldExceedMax =
                          !draftSelectedIds.has(r.id) &&
                          !alreadyAdded &&
                          selected.length + draftedNewCount >= MAX_LOCATIONS;

                        const disabled = wouldExceedMax;

                        return (
                          <li key={r.id}>
                            <label
                              className={[
                                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                                alreadyAdded
                                  ? "opacity-60 cursor-default"
                                  : disabled
                                  ? "opacity-50 cursor-not-allowed"
                                  : "cursor-pointer hover:bg-gray-50",
                              ].join(" ")}
                              onMouseDown={(e) => e.preventDefault()} // don’t blur input
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300"
                                checked={draftSelectedIds.has(r.id) || alreadyAdded}
                                disabled={disabled || alreadyAdded}
                                onChange={() => toggleDraft(r.id)}
                              />
                              <span className="text-gray-800">{r.label}</span>

                              {alreadyAdded && (
                                <span className="ml-auto text-xs text-gray-400">Added</span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 p-3">
                  <div className="text-xs text-gray-500">
                    {remaining} remaining • Max {MAX_LOCATIONS} locations
                  </div>

                  <button
                    type="button"
                    onClick={confirmDraft}
                    className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    disabled={draftSelectedIds.size === 0}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Remote toggle */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIncludeRemote((v) => !v)}
              className={[
                "relative h-6 w-11 rounded-full transition",
                includeRemote ? "bg-green-500" : "bg-gray-200",
              ].join(" ")}
              aria-label="Include Remote Jobs"
            >
              <span
                className={[
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
                  includeRemote ? "left-5" : "left-0.5",
                ].join(" ")}
              />
            </button>
            <span className="text-sm text-gray-800">Include Remote Jobs</span>
          </div>

          {/* helper text */}
          <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {loadingLocal ? (
              <span>Checking jobs available near you…</span>
            ) : (
              <span>Great! We’ve found jobs available near you.</span>
            )}
          </div>
        </div>
      </main>

      {/* bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
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
            onClick={async () => {
              try {
                await saveLocations();
                window.location.href = "/onboarding/account";
              } catch (e: any) {
                console.error("❌ saveLocations failed:", e?.message ?? e);
                setError(e?.message ?? "Failed to save locations");
              }
            }}
            className={
              "px-8 py-3 rounded-full font-medium text-white disabled:opacity-50 transition bg-black text-gray-600"
            }>
            Next
        </button>

        </div>
      </div>
    </div>
  );
}
 