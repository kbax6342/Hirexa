// app/onboarding/min-salary/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useRouter } from "next/navigation";
import {
  clampSalaryForType,
  formatSalary,
  parseSalaryInputToNumber,
  SALARY_BOUNDS,
  type CompensationType,
} from "@/app/lib/salary";


function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default function MinSalaryPage() {
  const router = useRouter();

  const [type, setType] = useState<CompensationType>("yearly");
  const [value, setValue] = useState<number>(50000);

  const config = useMemo(() => {
    if (type === "yearly") {
      return {
        min: SALARY_BOUNDS.yearly.min,
        max: SALARY_BOUNDS.yearly.max,
        step: 1000,
        unitLabel: "/ year",
        tinyUnit: "USD/year",
        storageKey: "onboarding_min_salary_yearly",
      };
    }
      return {
        min: SALARY_BOUNDS.hourly.min,
        max: SALARY_BOUNDS.hourly.max,
        step: 1,
        unitLabel: "/ hour",
        tinyUnit: "USD/hour",
        storageKey: "onboarding_min_salary_hourly",
    };
  }, [type]);

  async function saveMinSalaryToProfile(nextType: CompensationType, nextValue: number) {
    const parsed = parseSalaryInputToNumber(nextValue);
    if (parsed === null || parsed <= 0) {
      throw new Error("Please enter a valid minimum salary.");
    }

    const bounded = clampSalaryForType(parsed, nextType);
    const res = await fetch("/api/onboarding/min-salary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        compensationType: nextType,
        minCompensation: bounded,
      }),
    });
  
    const text = await res.text();
    console.log("min-salary POST raw:", { ok: res.ok, status: res.status, body: text });
  
    if (!res.ok) {
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch {}
      throw new Error(parsed?.error ?? parsed?.message ?? text ?? "Failed to save");
    }
  
    return text ? JSON.parse(text) : { ok: true };
  }
  
  
  
  



  // Load saved values (if any)
  useEffect(() => {
    try {
      const savedType = (localStorage.getItem("onboarding_comp_type") as CompensationType) || "yearly";
      const nextType = savedType === "hourly" ? "hourly" : "yearly";
      setType(nextType);

      const key = nextType === "yearly" ? "onboarding_min_salary_yearly" : "onboarding_min_salary_hourly";
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) setValue(parsed);
      } else {
        setValue(nextType === "yearly" ? 50000 : 25);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/onboarding/min-salary", {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data) return;

        const nextType: CompensationType =
          data.compensationType === "hourly" ? "hourly" : "yearly";
        const parsed = parseSalaryInputToNumber(data.minCompensation);
        if (parsed === null) return;

        const bounded = clampSalaryForType(parsed, nextType);

        if (!cancelled) {
          setType(nextType);
          setValue(bounded);
          persist(nextType, bounded);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep value within range when switching type
  useEffect(() => {
    setValue((v) => clamp(v, config.min, config.max));
  }, [config.min, config.max]);

  const percent = useMemo(() => {
    const p = ((value - config.min) / (config.max - config.min)) * 100;
    return clamp(p, 0, 100);
  }, [value, config.min, config.max]);

  const sliderBg = useMemo(() => {
    // blue filled left, light gray right
    return `linear-gradient(to right, rgb(37 99 235) 0%, rgb(37 99 235) ${percent}%, rgb(229 231 235) ${percent}%, rgb(229 231 235) 100%)`;
  }, [percent]);

  function persist(nextType: CompensationType, nextValue: number) {
    try {
      localStorage.setItem("onboarding_comp_type", nextType);
      const key = nextType === "yearly" ? "onboarding_min_salary_yearly" : "onboarding_min_salary_hourly";
      localStorage.setItem(key, String(nextValue));
    } catch {
      // ignore
    }
  }

  function onChangeType(next: CompensationType) {
    setType(next);
    // load the other value if saved, else set a sane default
    try {
      const key = next === "yearly" ? "onboarding_min_salary_yearly" : "onboarding_min_salary_hourly";
      const raw = localStorage.getItem(key);
      const fallback = next === "yearly" ? 50000 : 25;
      const nextValue = raw ? clamp(Number(raw), next === "yearly" ? 20000 : 10, next === "yearly" ? 300000 : 200) : fallback;
      setValue(nextValue);
      persist(next, nextValue);
    } catch {
      const fallback = next === "yearly" ? 50000 : 25;
      setValue(fallback);
    }
  }

  async function onContinue() {
    persist(type, value);
  
    try {
      const proof = await saveMinSalaryToProfile(type, value);
      console.log("✅ PROOF: min-salary saved:", proof);
  
      // ✅ Now print the entire onboarding snapshot (resume + job titles + salary)
      const debugRes = await fetch("/api/onboarding/debug", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
  
      const debugText = await debugRes.text();
      console.log("📦 ONBOARDING DEBUG raw:", {
        ok: debugRes.ok,
        status: debugRes.status,
        body: debugText,
      });
  
      if (debugRes.ok) {
        try {
          const snapshot = debugText ? JSON.parse(debugText) : null;
          console.log("✅ ONBOARDING SNAPSHOT (resume + jobs + salary):", snapshot);
        } catch {
          console.warn("Debug endpoint did not return JSON.");
        }
      }
  
      router.push("/onboarding/skills");
    } catch (err) {
      console.error("❌ min salary save failed:", err);
      // decide if you want to block or allow navigation
    }
  }
  
  
  

  function onSkip() {
    // up to you: either store null or just navigate
    router.push("/onboarding/next-step"); // change to your real next step
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
  

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-start px-6 pt-8">
        <div className="w-full max-w-2xl">
          <div className="flex items-center justify-center gap-2 mt-[50]">
            <h1 className="text-center text-4xl font-bold text-gray-900">
              How much would you like to earn?
            </h1>
            <span
              title="This helps us filter jobs by your minimum desired pay."
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-bold text-gray-500"
            >
              i
            </span>
          </div>

          {/* Compensation type */}
          <div className="mt-10">
            <div className="text-xs font-medium text-gray-700">Compensation type</div>

            <div className="mt-3 flex items-center gap-6 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-gray-900">
                <input
                  type="radio"
                  name="compType"
                  checked={type === "yearly"}
                  onChange={() => onChangeType("yearly")}
                  className="h-4 w-4 accent-blue-600"
                />
                <span className="font-medium">Yearly</span>
                <span className="text-xs text-gray-400">({config.tinyUnit.replace("USD/", "USD/")})</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-gray-900">
                <input
                  type="radio"
                  name="compType"
                  checked={type === "hourly"}
                  onChange={() => onChangeType("hourly")}
                  className="h-4 w-4 accent-blue-600"
                />
                <span className="font-medium">Hourly</span>
                <span className="text-xs text-gray-400">(USD/hour)</span>
              </label>
            </div>
          </div>

          {/* Minimum desired compensation */}
          <div className="mt-10">
            <div className="text-xs font-medium text-gray-700">Minimum desired compensation</div>

            <div className="mt-4 flex items-center gap-6">
              {/* Slider */}
              <div className="flex-1">
                <input
                  type="range"
                  min={config.min}
                  max={config.max}
                  step={config.step}
                  value={value}
                  onChange={(e) => {
                    const next = clamp(Number(e.target.value), config.min, config.max);
                    setValue(next);
                    persist(type, next);
                  }}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full"
                  style={{ background: sliderBg }}
                />

                {/* Range thumb styling */}
                <style jsx>{`
                  input[type="range"]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    height: 18px;
                    width: 18px;
                    border-radius: 9999px;
                    background: white;
                    border: 3px solid rgb(37 99 235);
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
                  }
                  input[type="range"]::-moz-range-thumb {
                    height: 18px;
                    width: 18px;
                    border-radius: 9999px;
                    background: white;
                    border: 3px solid rgb(37 99 235);
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
                  }
                `}</style>
              </div>

              {/* Value input */}
              <div className="flex items-center gap-3">
                <input
                  inputMode="numeric"
                  value={type === "hourly" ? String(value) : String(value)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^\d]/g, "");
                    const nextRaw = digits ? Number(digits) : config.min;
                    const next = clamp(nextRaw, config.min, config.max);
                    setValue(next);
                    persist(type, next);
                  }}
                  className="w-28 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <div className="text-sm text-gray-600">{config.unitLabel}</div>
              </div>
            </div>

            <div className="mt-2 text-sm text-gray-700">
              Minimum salary: <span className="font-semibold">{formatSalary(value, type)}</span>
            </div>

            {/* Little helper line spacing like screenshot */}
            <div className="mt-2 text-xs text-gray-400">
              {type === "yearly"
                ? "Tip: Set a minimum you’d be happy with — we’ll still show higher-paying roles."
                : "Tip: Hourly minimum helps filter part-time and contract roles."}
            </div>
          </div>
        </div>
      </main>

      {/* Bottom actions */}
      <footer className="px-6 py-6 flex justify-between items-center border-t border-gray-200 bg-white">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-6 py-3 text-black font-medium rounded-full border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>

        <button
          onClick={onContinue}
          className="px-8 py-3 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition-colors"
        >
          Next
        </button>
      </footer>

      <div className="sr-only">
        <Link href="/">Home</Link>
      </div>
    </div>
  );
}
