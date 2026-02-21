"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowUpTrayIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

type ExperienceItem = {
  id: string;
  title: string;
  company: string;
  location: string;
  dateRange: string;
  bullets: string[];
};

type PreferenceForm = {
  roleFocus: string;
  availability: string;
  compensationType: "yearly" | "hourly";
  minCompensation: number;
  includeRemote: boolean;
  workplaceLocations: string[];
  selectedPlan: "trial" | "annual";
  benefits: string[];
};

type ProfileApiResponse = {
  ok: boolean;
  profile: {
    id: string;
    userId?: string | null;
    guestId?: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    skills?: string[];
    registrationStatus?: string | null;
    welcomeEmailSentAt?: string | null;
    keyQuestions?: unknown;
    workplaceLocations?: unknown;
    includeRemote?: boolean;
    newsletterOptIn?: boolean;
    newsletterSource?: string | null;
    trialSubscriber?: boolean;
    monthlySubscriber?: boolean;
    yearlySubscriber?: boolean;
    trialPlanStatus?: string | null;
    monthlyPlanStatus?: string | null;
    yearlyPlanStatus?: string | null;
    lastPaymentReceivedAt?: string | null;
    subscriptionCheckedAt?: string | null;
    subscriptionPurchasedAt?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    subscriptionEmail?: string | null;
    emailVerifiedAt?: string | null;
    unsubscribedAt?: string | null;
    resumeSkills?: string[];
    minCompensation?: number | null;
    compensationType?: string | null;
    expertise?: string[];
    profileImageUrl?: string | null;
    profileImageFilename?: string | null;
    dob?: string | null;
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    state?: string | null;
    linkedinUrl?: string | null;
    authorizedUS?: string | null;
    sponsorship?: string | null;
    felony?: string | null;
    startDate?: string | null;
    screening?: string | null;
    relocate?: string | null;
    gender?: string | null;
    pronouns?: string | null;
    ethnicity?: string | null;
    disability?: string | null;
    veteran?: string | null;
    createdAt?: string;
    updatedAt?: string;
    jobInterests?: unknown[];
    benefitSelections?: unknown[];
    resumeFiles?: unknown[];
    jobApplications?: unknown[];
    stripePayments?: unknown[];
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
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeUploadError, setResumeUploadError] = useState<string | null>(null);
  const [resumeUploadSuccess, setResumeUploadSuccess] = useState<string | null>(null);
  const [showPreferenceEditor, setShowPreferenceEditor] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [preferencesForm, setPreferencesForm] = useState<PreferenceForm>({
    roleFocus: "",
    availability: "asap",
    compensationType: "yearly",
    minCompensation: 50000,
    includeRemote: true,
    workplaceLocations: [],
    selectedPlan: "trial",
    benefits: [],
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resumeInputRef = useRef<HTMLInputElement | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/profile", { cache: "no-store" });
      const data = (await readJsonResponse<ProfileApiResponse>(res)) ?? null;

      if (!res.ok) {
        const message = typeof (data as { error?: unknown } | null)?.error === "string"
          ? (data as { error?: string }).error
          : "Failed to load profile";
        throw new Error(message);
      }

      setProfile(data.profile ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "Not provided in database";
  const email = profile?.email || "Not provided in database";
  const phone = profile?.phone || "Not provided in database";
  const databaseSnapshot = useMemo(() => {
    if (!profile) return "No profile row found in database.";
    return JSON.stringify(profile, null, 2);
  }, [profile]);

  const subscriptionSummary = useMemo(
    () => ({
      email: profile?.subscriptionEmail ?? profile?.email ?? "Not found",
      isSubscribed: Boolean(
        profile?.trialSubscriber || profile?.monthlySubscriber || profile?.yearlySubscriber
      )
        ? "Yes"
        : "No",
      planStatus:
        profile?.trialPlanStatus ?? profile?.monthlyPlanStatus ?? profile?.yearlyPlanStatus ?? "none",
      purchasedAt: profile?.subscriptionPurchasedAt ?? "Not found",
      checkedAt: profile?.subscriptionCheckedAt ?? "Not found",
    }),
    [
      profile?.email,
      profile?.monthlyPlanStatus,
      profile?.monthlySubscriber,
      profile?.subscriptionCheckedAt,
      profile?.subscriptionEmail,
      profile?.subscriptionPurchasedAt,
      profile?.trialPlanStatus,
      profile?.trialSubscriber,
      profile?.yearlyPlanStatus,
      profile?.yearlySubscriber,
    ]
  );

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

  useEffect(() => {
    const keyQuestions =
      profile?.keyQuestions && typeof profile.keyQuestions === "object" && !Array.isArray(profile.keyQuestions)
        ? (profile.keyQuestions as Record<string, unknown>)
        : {};

    const existingBenefits = Array.isArray(profile?.benefitSelections) && profile?.benefitSelections.length
      ? (profile.benefitSelections[0] as { selectedPlan?: unknown; benefits?: unknown[] })
      : null;

    const rawLocations = Array.isArray(profile?.workplaceLocations)
      ? profile.workplaceLocations
      : [];

    const workplaceLocations = rawLocations
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        return String((item as { label?: unknown }).label ?? "").trim();
      })
      .filter((item): item is string => Boolean(item));

    setPreferencesForm({
      roleFocus: String(keyQuestions.roleFocus ?? "").trim(),
      availability: String(keyQuestions.availability ?? "asap").trim() || "asap",
      compensationType: profile?.compensationType === "hourly" ? "hourly" : "yearly",
      minCompensation: Math.max(0, profile?.minCompensation ?? 50000),
      includeRemote: profile?.includeRemote ?? true,
      workplaceLocations,
      selectedPlan: existingBenefits?.selectedPlan === "annual" ? "annual" : "trial",
      benefits: Array.isArray(existingBenefits?.benefits)
        ? existingBenefits.benefits.map((item) => String(item)).filter(Boolean)
        : [],
    });
  }, [profile]);

  async function savePreferences() {
    try {
      setSavingPreferences(true);
      setPreferencesError(null);

      const res = await fetch("/api/profile/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleFocus: preferencesForm.roleFocus,
          availability: preferencesForm.availability,
          compensationType: preferencesForm.compensationType,
          minCompensation: preferencesForm.minCompensation,
          includeRemote: preferencesForm.includeRemote,
          workplaceLocations: preferencesForm.workplaceLocations.length
            ? preferencesForm.workplaceLocations.map((label) => ({ label }))
            : null,
          selectedPlan: preferencesForm.selectedPlan,
          benefits: preferencesForm.benefits,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to save preferences.");
      }

      setProfile((prev) => {
        if (!prev) return prev;

        return {
          ...prev,
          minCompensation: preferencesForm.minCompensation,
          compensationType: preferencesForm.compensationType,
          includeRemote: preferencesForm.includeRemote,
          workplaceLocations: preferencesForm.workplaceLocations.map((label) => ({ label })),
          keyQuestions: {
            roleFocus: preferencesForm.roleFocus,
            availability: preferencesForm.availability,
          },
          benefitSelections: [
            {
              selectedPlan: preferencesForm.selectedPlan,
              benefits: preferencesForm.benefits,
            },
          ],
        };
      });
    } catch (e) {
      setPreferencesError(e instanceof Error ? e.message : "Failed to save preferences.");
    } finally {
      setSavingPreferences(false);
    }
  }

  function toggleBenefit(benefit: string) {
    setPreferencesForm((prev) => ({
      ...prev,
      benefits: prev.benefits.includes(benefit)
        ? prev.benefits.filter((item) => item !== benefit)
        : [...prev.benefits, benefit],
    }));
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

      const data =
        (await readJsonResponse<{ ok?: boolean; error?: string; profileImageUrl?: string | null }>(res)) ?? {};

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

  async function handleResumeChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingResume(true);
      setResumeUploadError(null);
      setResumeUploadSuccess(null);

      const formData = new FormData();
      formData.append("resume", file);

      const res = await fetch("/api/onboarding/resume", {
        method: "POST",
        body: formData,
      });

      const data = await readJsonResponse<{ ok?: boolean; error?: string; parsed?: { experienceCount?: number } }>(res);

      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to upload resume.");
      }

      const count = data?.parsed?.experienceCount ?? 0;
      setResumeUploadSuccess(`Resume uploaded and parsed. ${count} experience record${count === 1 ? "" : "s"} saved.`);
      await loadProfile();
    } catch (e) {
      setResumeUploadError(e instanceof Error ? e.message : "Failed to upload resume.");
    } finally {
      setUploadingResume(false);
      event.target.value = "";
    }
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
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <section className="lg:col-span-5 lg:order-2">
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

          <section className="lg:col-span-7 lg:order-1">
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
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-slate-700">Resume (from database)</div>
                      <button
                        type="button"
                        onClick={() => resumeInputRef.current?.click()}
                        disabled={uploadingResume}
                        className={`inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold ring-1 ring-slate-200 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 ${NON_DB_TEXT_CLASS}`}
                      >
                        <ArrowUpTrayIcon className="h-4 w-4" />
                        {uploadingResume ? "Uploading…" : "Upload resume"}
                      </button>
                      <input
                        ref={resumeInputRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={handleResumeChange}
                      />
                    </div>
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
                    {resumeUploadSuccess ? (
                      <p className="mt-2 text-xs text-green-700">{resumeUploadSuccess}</p>
                    ) : null}
                    {resumeUploadError ? (
                      <p className="mt-2 text-xs text-red-600">{resumeUploadError}</p>
                    ) : null}
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

              </Card>
              <Card className="p-6">
                <div className="text-sm font-semibold text-slate-900">Subscription check</div>
                <p className={`mt-2 text-sm ${NON_DB_TEXT_CLASS}`}>
                  Stripe-backed subscription status for the logged-in profile.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <FieldRow label="Subscription email" value={subscriptionSummary.email} />
                  <FieldRow label="Subscribed" value={subscriptionSummary.isSubscribed} />
                  <FieldRow label="Current plan status" value={subscriptionSummary.planStatus} />
                  <FieldRow label="Purchased at" value={subscriptionSummary.purchasedAt} />
                  <FieldRow label="Checked at" value={subscriptionSummary.checkedAt} />
                </div>
              </Card>

              <Card className="p-6">
                <div className="text-sm font-semibold text-slate-900">Database profile snapshot</div>
                <p className={`mt-2 text-sm ${NON_DB_TEXT_CLASS}`}>
                  Live data returned from <code>/api/profile</code> for the logged-in user.
                </p>
                <pre className="mt-4 max-h-[28rem] overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100">
                  {databaseSnapshot}
                </pre>
              </Card>

              <Card className="p-6">
                <div className={`text-sm font-semibold ${NON_DB_TEXT_CLASS}`}>Job-matching signals</div>
                <p className={`mt-2 text-sm ${NON_DB_TEXT_CLASS}`}>
                  Add more details (roles, locations, salary, availability) to boost match quality.
                </p>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setShowPreferenceEditor((prev) => !prev)}
                    className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    {showPreferenceEditor ? "Hide Preferences" : "Update Preferences"}
                  </button>
                </div>

                {showPreferenceEditor ? (
                  <div className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField
                        label="Role focus"
                        value={preferencesForm.roleFocus}
                        onChange={(value) => setPreferencesForm((prev) => ({ ...prev, roleFocus: value }))}
                        options={["Software Engineer", "Product Manager", "Data Analyst", "Project Coordinator"]}
                      />

                      <SelectField
                        label="Availability"
                        value={preferencesForm.availability}
                        onChange={(value) => setPreferencesForm((prev) => ({ ...prev, availability: value }))}
                        options={["asap", "2-weeks", "30-days", "not-looking"]}
                      />

                      <SelectField
                        label="Salary type"
                        value={preferencesForm.compensationType}
                        onChange={(value) =>
                          setPreferencesForm((prev) => ({
                            ...prev,
                            compensationType: value === "hourly" ? "hourly" : "yearly",
                          }))
                        }
                        options={["yearly", "hourly"]}
                      />

                      <SelectField
                        label="Minimum salary"
                        value={String(preferencesForm.minCompensation)}
                        onChange={(value) =>
                          setPreferencesForm((prev) => ({
                            ...prev,
                            minCompensation: Number(value) || 0,
                          }))
                        }
                        options={["40000", "50000", "70000", "90000", "120000"]}
                      />

                      <SelectField
                        label="Workplace location"
                        value={preferencesForm.workplaceLocations[0] ?? "none"}
                        onChange={(value) =>
                          setPreferencesForm((prev) => ({
                            ...prev,
                            workplaceLocations: value === "none" ? [] : [value],
                          }))
                        }
                        options={["none", "New York, NY", "Austin, TX", "San Francisco, CA", "Chicago, IL"]}
                      />

                      <SelectField
                        label="Remote preference"
                        value={preferencesForm.includeRemote ? "include" : "exclude"}
                        onChange={(value) =>
                          setPreferencesForm((prev) => ({
                            ...prev,
                            includeRemote: value === "include",
                          }))
                        }
                        options={["include", "exclude"]}
                      />

                      <SelectField
                        label="Benefits plan"
                        value={preferencesForm.selectedPlan}
                        onChange={(value) =>
                          setPreferencesForm((prev) => ({
                            ...prev,
                            selectedPlan: value === "annual" ? "annual" : "trial",
                          }))
                        }
                        options={["trial", "annual"]}
                      />
                    </div>

                    <div>
                      <div className="mb-2 text-xs font-semibold text-slate-700">Benefit selections</div>
                      <div className="flex flex-wrap gap-2">
                        {["Health", "Dental", "Vision", "401k", "PTO"].map((benefit) => (
                          <button
                            key={benefit}
                            type="button"
                            onClick={() => toggleBenefit(benefit)}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                              preferencesForm.benefits.includes(benefit)
                                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                : "border-slate-300 bg-white text-slate-700"
                            }`}
                          >
                            {benefit}
                          </button>
                        ))}
                      </div>
                    </div>

                    {preferencesError ? <p className="text-xs text-red-600">{preferencesError}</p> : null}

                    <button
                      type="button"
                      onClick={() => void savePreferences()}
                      disabled={savingPreferences}
                      className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingPreferences ? "Saving..." : "Save Preferences"}
                    </button>
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

async function readJsonResponse<T>(res: Response): Promise<T | null> {
  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();

  if (!body) return null;

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(res.ok ? "Unexpected server response." : "Server returned a non-JSON response.");
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error("Invalid JSON response from server.");
  }
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

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
