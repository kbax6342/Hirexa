"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
    expertise?: string[];
    profileImageUrl?: string | null;
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
        bullets: {
          id: string;
          text: string;
        }[];
      }[];
    } | null;
  } | null;
};

const NON_DB_TEXT_CLASS = "text-green-700";

export default function ProfilePage() {
  const [expandedExp, setExpandedExp] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileApiResponse["profile"]>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/profile", { cache: "no-store" });
        const data = (await res.json()) as ProfileApiResponse;

        if (!res.ok) {
          const message = typeof (data as { error?: unknown }).error === "string"
            ? (data as { error?: string }).error
            : "Failed to load profile";
          throw new Error(message);
        }

        if (!cancelled) {
          setProfile(data.profile ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load profile");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "Not provided in database";
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

  const [selectedExpertise, setSelectedExpertise] = useState<string[]>([]);
  const [savingExpertise, setSavingExpertise] = useState(false);
  const [expertiseError, setExpertiseError] = useState<string | null>(null);

  const stats: Stat[] = useMemo(
    () => [
      {
        label: "Total experience",
        value: "Database-driven",
        sub: "resume experience loaded from database",
        icon: <ShieldCheckIcon className="h-5 w-5" />,
        accent: "peach",
      },
      {
        label: "Ratings",
        value: "4 Stars",
        sub: "static placeholder",
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
    [profile]
  );




  useEffect(() => {
    setSelectedExpertise(Array.isArray(profile?.expertise) ? profile.expertise : []);
  }, [profile?.expertise]);

  async function persistExpertise(nextExpertise: string[]) {
    try {
      setSavingExpertise(true);
      setExpertiseError(null);

      const res = await fetch("/api/profile/expertise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expertise: nextExpertise }),
      });

      const data = (await res.json()) as { error?: string; expertise?: string[] };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save expertise.");
      }

      setSelectedExpertise(Array.isArray(data.expertise) ? data.expertise : nextExpertise);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              expertise: Array.isArray(data.expertise) ? data.expertise : nextExpertise,
            }
          : prev
      );
    } catch (e) {
      setExpertiseError(e instanceof Error ? e.message : "Failed to save expertise.");
      setSelectedExpertise(Array.isArray(profile?.expertise) ? profile.expertise : []);
    } finally {
      setSavingExpertise(false);
    }
  }

  function toggleExpertise(label: string) {
    const next = selectedExpertise.includes(label)
      ? selectedExpertise.filter((item) => item !== label)
      : [...selectedExpertise, label];

    setSelectedExpertise(next);
    void persistExpertise(next);
  }

  async function uploadPhoto(file: File) {
    try {
      setUploadingPhoto(true);
      setError(null);

      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/profile/photo", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as { ok?: boolean; error?: string; profileImageUrl?: string | null };

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to upload profile photo");
      }

      setProfile((prev) => (prev ? { ...prev, profileImageUrl: data.profileImageUrl ?? null } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload profile photo");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    await uploadPhoto(file);
    event.target.value = "";
  }

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
      <main className="mx-auto w-full max-w-6xl px-4 py-12">
        <div className="-mt-6 grid gap-6 lg:grid-cols-12">
          <section className="lg:col-span-5">
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="h-16 w-16 overflow-hidden rounded-full bg-gradient-to-br from-rose-200 to-amber-200 ring-4 ring-white">
                    {profile?.profileImageUrl ? (
                      <Image
                        src={profile.profileImageUrl}
                        alt="Profile"
                        width={64}
                        height={64}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-bold text-indigo-950">
                        {name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1" />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className={`inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold ring-1 ring-slate-200 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 ${NON_DB_TEXT_CLASS}`}
                >
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  {uploadingPhoto ? "Uploading…" : "Upload Photo"}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>

              <div className="mt-6 space-y-4">
                <FieldRow label="Your Name" value={name} />
                <FieldRow label="Email" value={email} />
                <FieldRow label="Phone Number" value={phone} />
              </div>

              {loading ? <p className={`mt-4 text-sm ${NON_DB_TEXT_CLASS}`}>Loading profile from database…</p> : null}
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

          <section className="lg:col-span-7">
            <div className="space-y-6">
              <Card className="p-6">
                <div className="flex-col items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Professional Details</div>
                    <p className={`mt-1 text-sm ${NON_DB_TEXT_CLASS}`}>
                      Non-database helper copy is shown in green.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-indigo-50 p-3 ring-1 ring-indigo-100">
                    <ShieldCheckIcon className="h-6 w-6 text-indigo-700" />
                  </div>

                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-semibold text-slate-700">Resume (from database)</div>
                    {profile?.resume ? (
                      <div className="mt-2 space-y-1 text-sm text-slate-700">
                        <p>
                          <span className="font-semibold">File:</span> {profile.resume.filename}
                        </p>
                        <p>
                          <span className="font-semibold">Type:</span> {profile.resume.mimeType}
                        </p>
                      </div>
                    ) : (
                      <p className={`mt-2 text-sm ${NON_DB_TEXT_CLASS}`}>No resume record found in database.</p>
                    )}
                  </div>

                  <div className="mt-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-slate-700">Experience (from resume records)</div>

                      <button
                        type="button"
                        className={`rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold hover:bg-slate-200 ${NON_DB_TEXT_CLASS}`}
                      >
                        + Add experience
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {experience.length === 0 ? (
                        <p className={`text-sm ${NON_DB_TEXT_CLASS}`}>No experience rows found in database.</p>
                      ) : null}

                      {experience.map((exp) => {
                        const open = !!expandedExp[exp.id];
                        const bullets = open ? exp.bullets : exp.bullets.slice(0, 2);
                        const showToggle = exp.bullets.length > 2;

                        return (
                          <div key={exp.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <div className="text-sm font-semibold text-slate-900">{exp.title}</div>
                                  <span className="text-sm text-slate-300">|</span>
                                  <div className="text-sm font-semibold text-slate-700">{exp.company}</div>
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
                  <div className={`text-xs font-semibold ${NON_DB_TEXT_CLASS}`}>Expertise in</div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {chips.map((c) => {
                      const isSelected = selectedExpertise.includes(c.label);

                      return (
                        <button
                          type="button"
                          key={c.label}
                          disabled={savingExpertise}
                          onClick={() => toggleExpertise(c.label)}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold shadow-[0_1px_0_rgba(15,23,42,0.03)] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            isSelected
                              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                              : `border-slate-200 bg-white ${NON_DB_TEXT_CLASS}`
                          }`}
                          aria-pressed={isSelected}
                        >
                          <span className={isSelected ? "text-indigo-700" : NON_DB_TEXT_CLASS}>{c.icon}</span>
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  {expertiseError ? <p className="mt-2 text-xs text-red-600">{expertiseError}</p> : null}
                </div>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stats.map((s) => (
                  <StatCard key={s.label} stat={s} />
                ))}
              </div>

              <Card className="p-6">
                <div className={`text-sm font-semibold ${NON_DB_TEXT_CLASS}`}>Job-matching signals</div>
                <p className={`mt-2 text-sm ${NON_DB_TEXT_CLASS}`}>
                  Add more details (roles, locations, salary, availability) to boost match quality.
                </p>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className={`flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 ${NON_DB_TEXT_CLASS}`}
                  >
                    Update Preferences
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-50 ${NON_DB_TEXT_CLASS}`}
                  >
                    Review Key Questions
                  </button>
                </div>
              </Card>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={["rounded-3xl border border-slate-200 bg-white shadow-sm", className].join(" ")}>{children}</div>;
}

function FieldRow({ label, value }: { label: string; value: string }) {
  const isDbFallback = value.includes("Not provided in database");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-600">{label}</div>
          <div className={`mt-1 truncate text-sm font-semibold ${isDbFallback ? NON_DB_TEXT_CLASS : "text-slate-900"}`}>{value}</div>
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
