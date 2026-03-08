// app/onboarding/choose-workplace/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type LocationOption = {
  id: string; // stable id for list rendering
  label: string; // e.g. "Chicago, Illinois" or "Chicago, IL"
  lat?: number;
  lon?: number;
};

const DEBOUNCE_MS = 600;

export default function ChooseWorkplacePage() {
  // single selected city (persisted in this page state)
  const [selectedCity, setSelectedCity] = useState<LocationOption | null>(null);
  const [includeRemote, setIncludeRemote] = useState(true);

  // search UI
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // dropdown results
  const [results, setResults] = useState<LocationOption[]>([]);
  const [draftSelectedId, setDraftSelectedId] = useState<string | null>(null);

  // loading + error
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // cancel in-flight search when typing
  const abortRef = useRef<AbortController | null>(null);

  const router = useRouter();

  const selectedLabelLower = useMemo(
    () => (selectedCity?.label ?? "").toLowerCase(),
    [selectedCity]
  );

  function removePill() {
    setSelectedCity(null);
  }

  function toggleDraft(id: string) {
    setDraftSelectedId((prev) => (prev === id ? null : id));
  }

  function confirmDraft() {
    const chosen = results.find((r) => r.id === draftSelectedId);
    if (!chosen) return;

    setSelectedCity(chosen);
    setOpen(false);
    setQuery("");
    setResults([]);
    setDraftSelectedId(null);
  }

  async function saveLocations() {
    if (!selectedCity) {
      throw new Error("Please select a city before continuing.");
    }

    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        includeRemote,
        location: {
          label: selectedCity.label,
          lat: selectedCity.lat,
          lon: selectedCity.lon,
        },
      }),
    });

    const text = await res.text();
    console.log("choose-workplace /locations raw:", { ok: res.ok, status: res.status, body: text });

    if (!res.ok) {
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {}
      throw new Error(parsed?.error ?? parsed?.message ?? text ?? "Failed to save locations");
    }

    const parsed = text ? JSON.parse(text) : { ok: true };
    console.log("PROOF locations saved:", parsed?.proof ?? parsed);
    return parsed;
  }

  // ---------- Load saved city (if any), otherwise auto-detect local city/state ----------
  useEffect(() => {
    let cancelled = false;

    async function hydrateLocation() {
      setLoadingLocal(true);
      setError(null);

      try {
        let usedSaved = false;

        try {
          const res = await fetch("/api/locations", { cache: "no-store" });
          const data = res.ok ? await res.json().catch(() => null) : null;
          const saved = data?.location;

          if (saved?.label && !cancelled) {
            usedSaved = true;
            setSelectedCity({
              id: `saved:${saved.label}`,
              label: String(saved.label),
              lat: typeof saved.lat === "number" ? saved.lat : undefined,
              lon: typeof saved.lon === "number" ? saved.lon : undefined,
            });
            if (typeof data?.includeRemote === "boolean") {
              setIncludeRemote(Boolean(data.includeRemote));
            }
          }
        } catch {
          // Ignore saved lookup errors; fall back to geo.
        }

        if (!usedSaved) {
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

          setSelectedCity((prev) => {
            if (prev) return prev;
            return { id: `local:${label}`, label };
          });
        }
      } catch {
        // If user blocks geo, just don't prefill. No error needed.
      } finally {
        if (!cancelled) setLoadingLocal(false);
      }
    }

    hydrateLocation();
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
    setDraftSelectedId(null);

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
    console.log("Selected city (client state):", selectedCity);
  }, [selectedCity]);

  useEffect(() => {
    console.log("includeRemote:", includeRemote);
  }, [includeRemote]);

  return (
    <div className="min-h-screen bg-white" ref={containerRef}>
      {/* top-left brand placeholder */}
      <div className="px-10 pt-8"></div>

      <main className="mx-auto mt-14 max-w-3xl px-6">
        <h1 className="text-center text-3xl font-semibold text-gray-900">Where do you want to work?</h1>
        <p className="mt-2 text-center text-sm text-gray-500">Choose one city for now.</p>

        <div className="mt-10">
          <label className="mb-2 block text-sm font-medium text-gray-700">City or state</label>

          {/* Input with pill inside */}
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
              {selectedCity ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-800">
                  {selectedCity.label}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removePill();
                    }}
                    className="rounded-full px-1 text-gray-500 hover:bg-gray-200 hover:text-gray-800"
                    aria-label={`Remove ${selectedCity.label}`}
                  >
                    x
                  </button>
                </span>
              ) : null}

              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  setError(null);
                }}
                onFocus={() => setOpen(true)}
                placeholder={selectedCity ? "" : "Search city or state..."}
                className="min-w-[160px] flex-1 border-0 bg-transparent py-1 text-sm text-gray-800 outline-none placeholder:text-gray-400"
              />
            </div>

            {/* Dropdown */}
            {open && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-xl border border-gray-200 bg-white shadow-lg">
                <div className="max-h-64 overflow-auto p-2">
                  {loadingSearch ? (
                    <div className="p-3 text-sm text-gray-500">Searching...</div>
                  ) : error ? (
                    <div className="p-3 text-sm text-red-600">{error}</div>
                  ) : results.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500">
                      {query.trim().length < 2 ? "Type at least 2 letters..." : "No results."}
                    </div>
                  ) : (
                    <ul className="space-y-1">
                      {results.map((r) => {
                        const alreadySelected = selectedLabelLower === r.label.toLowerCase();
                        const checked = draftSelectedId ? draftSelectedId === r.id : alreadySelected;

                        return (
                          <li key={r.id}>
                            <label
                              className={[
                                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-gray-50",
                                alreadySelected ? "bg-gray-50" : "",
                              ].join(" ")}
                              onMouseDown={(e) => e.preventDefault()} // don't blur input
                            >
                              <input
                                type="radio"
                                name="workplace-city"
                                className="h-4 w-4 border-gray-300"
                                checked={checked}
                                onChange={() => toggleDraft(r.id)}
                              />
                              <span className="text-gray-800">{r.label}</span>

                              {alreadySelected && !draftSelectedId ? (
                                <span className="ml-auto text-xs text-gray-400">Selected</span>
                              ) : null}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 p-3">
                  <div className="text-xs text-gray-500">Choose 1 city</div>

                  <button
                    type="button"
                    onClick={confirmDraft}
                    className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    disabled={!draftSelectedId}
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
              <span>Checking jobs available near you...</span>
            ) : (
              <span>Great! We've found jobs available near you.</span>
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
                console.error("saveLocations failed:", e?.message ?? e);
                setError(e?.message ?? "Failed to save locations");
              }
            }}
            disabled={!selectedCity}
            className="px-8 py-3 rounded-full font-medium text-white disabled:opacity-50 transition bg-[#145efc] hover:bg-[#0f4ed6]"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
