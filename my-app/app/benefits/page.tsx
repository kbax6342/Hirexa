// app/questions/benefits/page.tsx
"use client";

import React, { useMemo, useState } from "react";

/**
 * NOTE:
 * - This is a client page because it uses state + click handlers.
 * - You can keep Font Awesome via <link>/<script> in your root layout (recommended),
 *   or leave it as-is and swap icons later.
 */

type BenefitCategory = {
  id: string;
  title: string;
  iconClass: string; // font-awesome icon class
  iconColorClass: string; // tailwind color class
  items: string[];
};

const CATEGORIES: BenefitCategory[] = [
  {
    id: "environment",
    title: "Work Environment",
    iconClass: "fa-solid fa-laptop-house",
    iconColorClass: "text-blue-500",
    items: ["Remote Work", "Hybrid Schedule", "Flexible Hours", "Dog Friendly Office", "Casual Dress"],
  },
  {
    id: "health",
    title: "Health & Wellness",
    iconClass: "fa-solid fa-heart-pulse",
    iconColorClass: "text-red-500",
    items: [
      "Health Insurance",
      "Dental Insurance",
      "Vision Insurance",
      "Gym Membership",
      "Mental Health Support",
      "Life Insurance",
    ],
  },
  {
    id: "financial",
    title: "Financial & Retirement",
    iconClass: "fa-solid fa-sack-dollar",
    iconColorClass: "text-green-500",
    items: ["401(k)", "401(k) Matching", "Performance Bonus", "Stock Options / Equity", "Signing Bonus"],
  },
  {
    id: "timeoff",
    title: "Vacation & Time Off",
    iconClass: "fa-solid fa-umbrella-beach",
    iconColorClass: "text-orange-400",
    items: ["Unlimited PTO", "Paid Sick Days", "Paid Holidays", "Parental Leave", "Sabbatical"],
  },
  {
    id: "perks",
    title: "Additional Perks",
    iconClass: "fa-solid fa-gift",
    iconColorClass: "text-purple-500",
    items: [
      "Professional Development",
      "Tuition Reimbursement",
      "Free Lunch/Snacks",
      "Company Retreats",
      "Home Office Stipend",
    ],
  },
];

export default function JobBenefitsSelectionPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectedCount = selected.size;

  const allBenefits = useMemo(() => {
    const flat = CATEGORIES.flatMap((c) => c.items);
    return Array.from(new Set(flat));
  }, []);

  const filteredBenefits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return new Set<string>(); // no special filtering UI by default
    const matches = allBenefits.filter((b) => b.toLowerCase().includes(q));
    return new Set(matches);
  }, [query, allBenefits]);

  function toggleBenefit(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function removeBenefit(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  }

  function clearAll() {
    setSelected(new Set());
  }

  const statusText = selectedCount > 0 ? "Great choices!" : "Select at least 1 benefit";
  const statusTextClass = selectedCount > 0 ? "text-green-600" : "text-slate-500";
  const nextEnabled = selectedCount > 0;

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between bg-[#0B1120] px-8 py-4 text-white">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-500 text-lg font-bold">
            H
          </div>
          <span className="text-xl font-bold tracking-tight">
            Hirexa <span className="text-blue-400">AI</span>
          </span>
        </div>

        <nav className="hidden gap-8 text-sm font-medium text-gray-300 md:flex">
          <a href="#" className="transition-colors hover:text-white">
            Features
          </a>
          <a href="#" className="transition-colors hover:text-white">
            How It Works
          </a>
          <a href="#" className="transition-colors hover:text-white">
            Find Jobs
          </a>
          <a href="#" className="transition-colors hover:text-white">
            Job Locations
          </a>
          <div className="group relative cursor-pointer">
            <span className="flex items-center gap-1 transition-colors hover:text-white">
              Job Resources <i className="fa-solid fa-chevron-down mt-0.5 text-xs" />
            </span>
          </div>
        </nav>

        <button className="rounded-full bg-blue-500 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600">
          Sign In
        </button>
      </header>

      {/* Main */}
      <main className="mx-auto flex w-full max-w-4xl flex-grow flex-col items-center px-4 pb-32 pt-16">
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-4xl font-bold text-slate-900">What benefits matter most to you?</h1>
          <p className="text-lg text-slate-500">
            Select the perks and benefits you&apos;re looking for in your next role.
          </p>
        </div>

        <div className="w-full space-y-8">
          {/* Search */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <i className="fa-solid fa-magnifying-glass text-slate-400" />
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for benefits (e.g., Remote Work, 401k, Health Insurance)"
              className="w-full rounded-xl border border-slate-200 py-4 pl-11 pr-4 text-base text-slate-700 shadow-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Selected box */}
          <div className="relative min-h-[120px] rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                Selected benefits{" "}
                <span className="ml-1 font-normal text-slate-400">({selectedCount} selected)</span>
              </h3>

              {selectedCount > 0 ? (
                <button
                  onClick={clearAll}
                  className="text-xs font-medium text-orange-500 hover:text-orange-600"
                  type="button"
                >
                  Clear all
                </button>
              ) : null}
            </div>

            {selectedCount === 0 ? (
              <div className="py-2 text-sm italic text-slate-400">
                No benefits selected yet. Browse the categories below to add benefits.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Array.from(selected).map((name) => (
                  <div
                    key={name}
                    className="animate-fade-in inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => removeBenefit(name)}
                      className="hover:text-blue-900 focus:outline-none"
                      aria-label={`Remove ${name}`}
                    >
                      <i className="fa-solid fa-xmark text-xs" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Categories */}
          <div className="space-y-8">
            {CATEGORIES.map((cat) => {
              const showOnlyMatches = query.trim().length > 0;
              const items = showOnlyMatches
                ? cat.items.filter((b) => filteredBenefits.has(b))
                : cat.items;

              if (showOnlyMatches && items.length === 0) return null;

              return (
                <section key={cat.id} className="benefit-category">
                  <h4 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900">
                    <i className={`${cat.iconClass} ${cat.iconColorClass}`} /> {cat.title}
                  </h4>

                  <div className="flex flex-wrap gap-3">
                    {items.map((name) => {
                      const isSelected = selected.has(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggleBenefit(name)}
                          className={[
                            "benefit-chip group flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all",
                            isSelected
                              ? "selected border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-blue-300",
                          ].join(" ")}
                        >
                          <i
                            className={[
                              "text-xs transition-colors",
                              isSelected
                                ? "fa-solid fa-check text-blue-500"
                                : "fa-solid fa-plus text-slate-300 group-hover:text-blue-400",
                            ].join(" ")}
                          />
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white p-4">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between px-8">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-white transition-colors hover:bg-slate-700"
              aria-label="Profile"
            >
              <span className="text-xs font-bold">N</span>
            </button>

            <div className="h-6 w-px bg-slate-200" />

            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-slate-300 px-6 py-2.5 font-medium text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-50"
              onClick={() => window.history.back()}
            >
              <i className="fa-solid fa-arrow-left text-sm" /> Back
            </button>
          </div>

          <div className="flex items-center gap-4">
            <span className={`hidden text-sm sm:inline ${statusTextClass}`}>{statusText}</span>

            <button
              type="button"
              disabled={!nextEnabled}
              onClick={() => {
                // TODO: route to next step
                // Example: router.push("/questions/stepX");
                alert(`Selected: ${Array.from(selected).join(", ")}`);
              }}
              className={[
                "rounded-full px-8 py-2.5 font-semibold text-white transition-all",
                nextEnabled
                  ? "cursor-pointer bg-slate-800 hover:bg-slate-900"
                  : "cursor-not-allowed bg-slate-500 opacity-50",
              ].join(" ")}
            >
              Next Step
            </button>
          </div>
        </div>
      </footer>

      {/* Component-scoped styles to match your HTML behavior */}
      <style jsx global>{`
        .benefit-chip {
          transition: all 0.2s ease;
        }
        .benefit-chip:hover {
          transform: translateY(-1px);
        }
        .benefit-chip.selected i {
          color: #3b82f6;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
