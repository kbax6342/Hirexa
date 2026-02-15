"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpTrayIcon,
  PencilSquareIcon,
  StarIcon,
  ShieldCheckIcon,
  BriefcaseIcon,
  CurrencyDollarIcon,
  AcademicCapIcon,
  BuildingOffice2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

/** --------------------------
 * Types
 * -------------------------- */
type Stat = {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: "peach" | "yellow" | "blue";
};

type Chip = {
  label: string;
  icon: React.ReactNode;
};

type BillingSummary = {
  ok: boolean;
  billing: {
    planName: string | null;
    priceLabel: string | null; // "$18.95 / month"
    status: string | null; // "active" | "trialing" | ...
    nextBillingDate: string | null; // ISO
    trialEnd: string | null; // ISO
    paymentMethod: string | null; // "Visa •••• 4242"
  } | null;
};

type ExperienceItem = {
  id: string;
  title: string;
  company: string;
  location: string;
  dateRange: string;
  bullets: string[];
};

type ProfileApiResponse = {
  ok: boolean;
  profile: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    resume: {
      id: string;
      filename: string;
      mimeType: string;
      updatedAt: string;
      experiences: {
        id: string;
        title: string;
        company: string;
        location: string | null;
        dateRange: string | null;
        bullets: { id: string; text: string }[];
      }[];
    } | null;
  } | null;
};

const NON_DB_TEXT_CLASS = "text-green-700";

/** --------------------------
 * Helpers
 * -------------------------- */
function fmtMaybeDate(iso: string | null) {
  if (!iso) return "Not available";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not available";
  return d.toLocaleDateString();
}

function fmtStatus(s: string | null) {
  if (!s) return "Not available";
  return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** --------------------------
 * Page
 * -------------------------- */
export default function ProfilePage() {
  const [expandedExp, setExpandedExp] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileApiResponse["profile"]>(null);

  // Billing
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingSummary["billing"]>(null);

  // Preferences UI
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [jobPrefs, setJobPrefs] = useState({
    jobTitle: "Data Analyst",
    location: "Detroit, MI",
    includeRemote: true,
    minSalary: "50000",
    salaryType: "yearly" as "yearly" | "hourly",
    includeNoComp: true,
  });

  // Load profile
  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/profile", { cache: "no-store" });
        const data = (await res.json()) as ProfileApiResponse;

        if (!res.ok) {
          const message =
            typeof (data as any)?.error === "string"
              ? (data as any).error
              : "Failed to load profile";
          throw new Error(message);
        }

        if (!cancelled) setProfile(data.profile ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load billing
  useEffect(() => {
    let cancelled = false;

    async function loadBilling() {
      try {
        setBillingLoading(true);
        setBillingError(null);

        const res = await fetch("/api/billing/summary", { cache: "no-store" });
        const data = (await res.json()) as BillingSummary;

        if (!res.ok || !data.ok) {
          const message =
            typeof (data as any)?.error === "string"
              ? (data as any).error
              : "Failed to load billing";
          throw new Error(message);
        }

        if (!cancelled) setBilling(data.billing ?? null);
      } catch (e) {
        if (!cancelled) setBillingError(e instanceof Error ? e.message : "Failed to load billing");
      } finally {
        if (!cancelled) setBillingLoading(false);
      }
    }

    loadBilling();
    return () => {
      cancelled = true;
    };
  }, []);

  const name =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    "Not provided in database";
  const email = profile?.email || "Not provided in database";
  const phone = profile?.phone || "Not provided in database";

  const experience: ExperienceItem[] = useMemo(() => {
    if (!profile?.resume?.experiences?.length) return [];
    return profile.resume.experiences.map((exp) => ({
      id: exp.id,
      title: exp.title,
      company: exp.company,
      location: exp.location ?? "Location not provided in database",
      dateRange: exp.dateRange ?? "Date range not provided in database",
      bullets: exp.bullets.map((b) => b.text),
    }));
  }, [profile]);

  const chips: Chip[] = useMemo(
    () => [
      { label: "Career", icon: <BriefcaseIcon className="h-4 w-4" /> },
      { label: "Money", icon: <CurrencyDollarIcon className="h-4 w-4" /> },
      { label: "Skills", icon: <AcademicCapIcon className="h-4 w-4" /> },
      { label: "Company", icon: <BuildingOffice2Icon className="h-4 w-4" /> },
    ],
    []
  );

  const stats: Stat[] = useMemo(
    () => [
      {
        label: "Total experience",
        value: experience.length ? `${experience.length} roles` : "No roles yet",
        sub: "pulled from resume records",
        icon: <ShieldCheckIcon className="h-5 w-5" />,
        accent: "peach",
      },
      {
        label: "Ratings",
        value: "4 Stars",
        sub: "placeholder (wire later)",
        icon: <StarIcon className="h-5 w-5" />,
        accent: "yellow",
      },
      {
        label: "Profile strength",
        value: profile ? "Loaded" : "Pending",
        sub: "computed in UI",
        icon: <ShieldCheckIcon className="h-5 w-5" />,
        accent: "blue",
      },
    ],
    [profile, experience.length]
  );

  function toggleExp(id: string) {
    setExpandedExp((p) => ({ ...p, [id]: !p[id] }));
  }

  function removeFromList(id: string) {
    setProfile((prev) => {
      if (!prev?.resume) return prev;
      return {
        ...prev,
        resume: {
          ...prev.resume,
          experiences: prev.resume.experiences.filter((x) => x.id !== id),
        },
      };
    });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto w-full max-w-6xl px-4 py-12 mt-[110]">
        <div className="-mt-6 grid gap-6 lg:grid-cols-12">
          {/* LEFT */}
          <section className="lg:col-span-5">
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="h-16 w-16 overflow-hidden rounded-full bg-gradient-to-br from-rose-200 to-amber-200 ring-4 ring-white">
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-indigo-950">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                  </div>
                </div>

                <div className="flex-1" />

                <button
                  type="button"
                  className={`inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold ring-1 ring-slate-200 hover:bg-slate-200 ${NON_DB_TEXT_CLASS}`}
                >
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  Upload Photo
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <FieldRow label="Your Name" value={name} />
                <FieldRow label="Email" value={email} />
                <FieldRow label="Phone Number" value={phone} />

                {/* PLAN */}
                <div className="pt-2">
                  <div className="text-xs font-semibold text-slate-600">Plan</div>

                  <div className="mt-3 space-y-3">
                    <FieldRow label="Plan name" value={billing?.planName ?? "Not available"} />
                    <FieldRow label="Price + interval" value={billing?.priceLabel ?? "Not available"} />
                    <FieldRow label="Status" value={fmtStatus(billing?.status ?? null)} />
                    <FieldRow label="Next billing date" value={fmtMaybeDate(billing?.nextBillingDate ?? null)} />
                    {billing?.trialEnd ? (
                      <FieldRow label="Trial end" value={fmtMaybeDate(billing.trialEnd)} />
                    ) : null}
                    <FieldRow label="Payment method" value={billing?.paymentMethod ?? "Not available"} />
                  </div>

                  {billingLoading ? (
                    <p className={`mt-3 text-sm ${NON_DB_TEXT_CLASS}`}>Loading plan from Stripe…</p>
                  ) : null}
                  {billingError ? <p className="mt-3 text-sm text-red-600">{billingError}</p> : null}
                </div>
              </div>

              {loading ? (
                <p className={`mt-4 text-sm ${NON_DB_TEXT_CLASS}`}>Loading profile from database…</p>
              ) : null}
              {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

              <div className="mt-6">
                <button
                  type="button"
                  className={`w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 ${NON_DB_TEXT_CLASS}`}
                >
                  Save changes
                </button>
              </div>
            </Card>
          </section>

          {/* RIGHT */}
          <section className="lg:col-span-7">
            <div className="space-y-6">
              <Card className="p-6">
                <div className="flex-col items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Professional Details
                    </div>
                    <p className={`mt-1 text-sm ${NON_DB_TEXT_CLASS}`}>
                      Green text is UI-only helper copy (not coming from the database yet).
                    </p>
                  </div>

                  <div className="rounded-2xl bg-indigo-50 p-3 ring-1 ring-indigo-100">
                    <ShieldCheckIcon className="h-6 w-6 text-indigo-700" />
                  </div>

                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-semibold text-slate-700">
                      Resume (from database)
                    </div>
                    {profile?.resume ? (
                      <div className="mt-2 space-y-1 text-sm text-slate-700">
                        <p>
                          <span className="font-semibold">File:</span>{" "}
                          {profile.resume.filename}
                        </p>
                        <p>
                          <span className="font-semibold">Type:</span>{" "}
                          {profile.resume.mimeType}
                        </p>
                      </div>
                    ) : (
                      <p className={`mt-2 text-sm ${NON_DB_TEXT_CLASS}`}>
                        No resume record found in database.
                      </p>
                    )}
                  </div>

                  <div className="mt-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-slate-700">
                        Experience (from resume records)
                      </div>

                      <button
                        type="button"
                        className={`rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold hover:bg-slate-200 ${NON_DB_TEXT_CLASS}`}
                      >
                        + Add experience
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {experience.length === 0 ? (
                        <p className={`text-sm ${NON_DB_TEXT_CLASS}`}>
                          No experience rows found in database.
                        </p>
                      ) : null}

                      {experience.map((exp) => {
                        const open = !!expandedExp[exp.id];
                        const bullets = open ? exp.bullets : exp.bullets.slice(0, 2);
                        const showToggle = exp.bullets.length > 2;

                        return (
                          <div
                            key={exp.id}
                            className="rounded-2xl border border-slate-200 bg-white p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <div className="text-sm font-semibold text-slate-900">
                                    {exp.title}
                                  </div>
                                  <span className="text-sm text-slate-300">|</span>
                                  <div className="text-sm font-semibold text-slate-700">
                                    {exp.company}
                                  </div>
                                </div>

                                <div className="mt-1 text-xs text-slate-500">
                                  {exp.location} • {exp.dateRange}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  aria-label="Edit experience"
                                  className={`rounded-xl p-2 hover:bg-slate-50 ${NON_DB_TEXT_CLASS}`}
                                  onClick={() => alert("Edit flow is not yet database-wired.")}
                                >
                                  <PencilSquareIcon className="h-5 w-5" />
                                </button>

                                <button
                                  type="button"
                                  aria-label="Delete experience"
                                  className={`rounded-xl p-2 hover:bg-slate-50 ${NON_DB_TEXT_CLASS}`}
                                  onClick={() => removeFromList(exp.id)}
                                >
                                  <TrashIcon className="h-5 w-5" />
                                </button>
                              </div>
                            </div>

                            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                              {bullets.map((b, i) => (
                                <li key={i}>{b}</li>
                              ))}
                            </ul>

                            {showToggle ? (
                              <button
                                type="button"
                                onClick={() => toggleExp(exp.id)}
                                className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold hover:text-green-900 ${NON_DB_TEXT_CLASS}`}
                              >
                                {open ? "Show less" : "Show more"}
                                {open ? (
                                  <ChevronUpIcon className="h-4 w-4" />
                                ) : (
                                  <ChevronDownIcon className="h-4 w-4" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className={`text-xs font-semibold ${NON_DB_TEXT_CLASS}`}>
                    Expertise in
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {chips.map((c) => (
                      <span
                        key={c.label}
                        className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold shadow-[0_1px_0_rgba(15,23,42,0.03)] ${NON_DB_TEXT_CLASS}`}
                      >
                        <span className={NON_DB_TEXT_CLASS}>{c.icon}</span>
                        {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stats.map((s) => (
                  <StatCard key={s.label} stat={s} />
                ))}
              </div>

              {/* JOB PREFS CARD */}
              <Card className="p-6">
                <div className={`text-sm font-semibold ${NON_DB_TEXT_CLASS}`}>
                  Job-matching signals
                </div>
                <p className={`mt-2 text-sm ${NON_DB_TEXT_CLASS}`}>
                  Tell Hirexa what you want, and we’ll filter the noise and surface better roles.
                </p>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setPrefsOpen((v) => !v)}
                    className={`flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 ${NON_DB_TEXT_CLASS}`}
                  >
                    {prefsOpen ? "Close Preferences" : "Update Preferences"}
                  </button>

                  <button
                    type="button"
                    className={`flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-50 ${NON_DB_TEXT_CLASS}`}
                  >
                    Review Key Questions
                  </button>
                </div>

                {prefsOpen ? (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-4">
                      <div className="text-xs font-semibold text-slate-700">* Job title</div>
                      <PillInput
                        value={jobPrefs.jobTitle}
                        placeholder="e.g. Data Analyst"
                        onChange={(v) => setJobPrefs((p) => ({ ...p, jobTitle: v }))}
                      />
                    </div>

                    <div className="mb-4">
                      <div className="text-xs font-semibold text-slate-700">* Location (US only)</div>
                      <PillInput
                        value={jobPrefs.location}
                        placeholder="e.g. Detroit, MI"
                        onChange={(v) => setJobPrefs((p) => ({ ...p, location: v }))}
                      />
                    </div>

                    <div className="mb-4 flex items-center gap-3">
                      <Toggle
                        checked={jobPrefs.includeRemote}
                        onChange={(checked) => setJobPrefs((p) => ({ ...p, includeRemote: checked }))}
                      />
                      <div className="text-sm font-semibold text-slate-900">Include Remote Jobs</div>
                    </div>

                    <div className="mb-4">
                      <div className="flex items-center gap-2">
                        <div className="text-xs font-semibold text-slate-700">
                          Minimum desired salary
                        </div>
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">
                          i
                        </span>
                      </div>

                      <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-500">$</span>
                            <input
                              value={jobPrefs.minSalary}
                              onChange={(e) =>
                                setJobPrefs((p) => ({
                                  ...p,
                                  minSalary: e.target.value.replace(/[^\d]/g, ""),
                                }))
                              }
                              inputMode="numeric"
                              className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                              placeholder="50000"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <input
                              type="radio"
                              name="salaryType"
                              checked={jobPrefs.salaryType === "yearly"}
                              onChange={() => setJobPrefs((p) => ({ ...p, salaryType: "yearly" }))}
                            />
                            Yearly{" "}
                            <span className="text-xs font-medium text-slate-500">
                              ($USD/year)
                            </span>
                          </label>

                          <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <input
                              type="radio"
                              name="salaryType"
                              checked={jobPrefs.salaryType === "hourly"}
                              onChange={() => setJobPrefs((p) => ({ ...p, salaryType: "hourly" }))}
                            />
                            Hourly{" "}
                            <span className="text-xs font-medium text-slate-500">
                              ($USD/hour)
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="mb-2 flex items-center gap-3">
                      <Toggle
                        checked={jobPrefs.includeNoComp}
                        onChange={(checked) => setJobPrefs((p) => ({ ...p, includeNoComp: checked }))}
                      />
                      <div className="text-sm font-semibold text-slate-900">
                        Include jobs without compensation info
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => {
                          console.log("Saving preferences:", jobPrefs);
                          setPrefsOpen(false);
                        }}
                        className="flex-1 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                      >
                        Save Preferences
                      </button>

                      <button
                        type="button"
                        onClick={() => setPrefsOpen(false)}
                        className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </Card>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/** --------------------------
 * Small UI Components
 * -------------------------- */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={["rounded-3xl border border-slate-200 bg-white shadow-sm", className].join(" ")}>
      {children}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  const isDbFallback = value.includes("Not provided in database");
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-600">{label}</div>
          <div className={`mt-1 truncate text-sm font-semibold ${isDbFallback ? NON_DB_TEXT_CLASS : "text-slate-900"}`}>
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  stat,
}: {
  stat: { label: string; value: string; sub?: string; icon: React.ReactNode; accent: "peach" | "yellow" | "blue" };
}) {
  const accent = stat.accent;
  const accentClasses =
    accent === "peach"
      ? "bg-orange-50 ring-orange-100 text-orange-700"
      : accent === "yellow"
      ? "bg-amber-50 ring-amber-100 text-amber-700"
      : "bg-sky-50 ring-sky-100 text-sky-700";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-xs font-semibold ${NON_DB_TEXT_CLASS}`}>{stat.label}</div>
          <div className={`mt-2 text-lg font-extrabold ${NON_DB_TEXT_CLASS}`}>{stat.value}</div>
          {stat.sub ? <div className={`mt-1 text-xs ${NON_DB_TEXT_CLASS}`}>{stat.sub}</div> : null}
        </div>
        <div className={["rounded-2xl p-3 ring-1", accentClasses].join(" ")}>{stat.icon}</div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full transition",
        checked ? "bg-emerald-500" : "bg-slate-200",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition",
          checked ? "translate-x-5" : "translate-x-1",
        ].join(" ")}
      />
      <span className="sr-only">Toggle</span>
    </button>
  );
}

function PillInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-900">
            {value}
            <button
              type="button"
              onClick={() => onChange("")}
              className="rounded-full px-1 text-indigo-700 hover:bg-indigo-100"
              aria-label="Clear"
            >
              ×
            </button>
          </span>
        ) : null}

        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-[180px] flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none"
        />
      </div>
    </div>
  );
}
