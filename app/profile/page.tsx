// E:\Web Applications\Hirexa\my-app\app\profile\page.tsx
"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowUpTrayIcon,
  PencilSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { formatSalary, type CompensationType } from "@/app/lib/salary";

type ExperienceItem = {
  id: string;
  title: string;
  company: string;
  location: string;
  dateRange: string;
  bullets: string[];
};

type PersonalDetailsForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  linkedinUrl: string;
  portfolioUrl: string;
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

type HirePilotStatus = {
  hirePilotUnlimited: boolean;
  hirePilotCredits: number;
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
    portfolioUrl?: string | null;
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

// ✅ Change your accent text color to sky-500
const NON_DB_TEXT_CLASS = "text-sky-500";

// ✅ Reusable button classes (sky-500 vibe)
const SKY_BTN_PRIMARY =
  "rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60";
const SKY_BTN_SOFT =
  "rounded-full bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60";
const SKY_BTN_SOFT_SM =
  "inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100";
const SKY_BTN_MUTED =
  "inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50";

export default function ProfilePage() {
  const [expandedExp, setExpandedExp] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileApiResponse["profile"]>(null);
  const [hirePilotStatus, setHirePilotStatus] = useState<HirePilotStatus | null>(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeUploadError, setResumeUploadError] = useState<string | null>(null);
  const [resumeUploadSuccess, setResumeUploadSuccess] = useState<string | null>(null);

  const [showPreferenceEditor, setShowPreferenceEditor] = useState(false);

  // ✅ Personal details edit mode
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [savingPersonalDetails, setSavingPersonalDetails] = useState(false);

  const [personalDetailsForm, setPersonalDetailsForm] = useState<PersonalDetailsForm>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    linkedinUrl: "",
    portfolioUrl: "",
  });

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

  // ✅ show all experiences toggle
  const [showAllExperiences, setShowAllExperiences] = useState(false);
  const [editingExperienceId, setEditingExperienceId] = useState<string | null>(null);
  const [editingBullets, setEditingBullets] = useState<string[]>([]);
  const [savingExperience, setSavingExperience] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/profile", { cache: "no-store" });
      const data = (await readJsonResponse<ProfileApiResponse>(res)) ?? null;

      if (!res.ok) {
        const message =
          typeof (data as { error?: unknown } | null)?.error === "string"
            ? (data as { error?: string }).error
            : "Failed to load profile";
        throw new Error(message);
      }

      setProfile(data?.profile ?? null);

      const hirePilotRes = await fetch("/api/user/hirepilot-status", {
        cache: "no-store",
      });

      if (hirePilotRes.ok) {
        const hirePilotData = await readJsonResponse<HirePilotStatus>(hirePilotRes);
        setHirePilotStatus(
          hirePilotData ?? {
            hirePilotUnlimited: false,
            hirePilotCredits: 0,
          }
        );
      } else {
        setHirePilotStatus({
          hirePilotUnlimited: false,
          hirePilotCredits: 0,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  // keep form synced from DB, but don't clobber while editing
  useEffect(() => {
    if (isEditingPersonal) return;

    setPersonalDetailsForm({
      firstName: profile?.firstName ?? "",
      lastName: profile?.lastName ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      address: profile?.address ?? "",
      city: profile?.city ?? "",
      state: profile?.state ?? "",
      postalCode: profile?.postalCode ?? "",
      linkedinUrl: profile?.linkedinUrl ?? "",
      portfolioUrl: profile?.portfolioUrl ?? "",
    });
  }, [profile, isEditingPersonal]);

  const name =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "Not provided in database";

  const databaseSnapshot = useMemo(() => {
    if (!profile) return "No profile row found in database.";
    return JSON.stringify(profile, null, 2);
  }, [profile]);

  const subscriptionSummary = useMemo(
    () => ({
      email: profile?.subscriptionEmail ?? profile?.email ?? "Not found",
      isSubscribed: Boolean(profile?.trialSubscriber || profile?.monthlySubscriber || profile?.yearlySubscriber)
        ? "Yes"
        : "No",
      planStatus: profile?.trialPlanStatus ?? profile?.monthlyPlanStatus ?? profile?.yearlyPlanStatus ?? "none",
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

  const formattedMinCompensation = useMemo(() => {
    const type: CompensationType =
      profile?.compensationType === "hourly" ? "hourly" : "yearly";
    return formatSalary(profile?.minCompensation ?? null, type);
  }, [profile?.minCompensation, profile?.compensationType]);

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

  const recentExperience = useMemo(() => experience.slice(0, 4), [experience]);

  // ✅ decide what to render in the list
  const visibleExperience = useMemo(() => {
    return showAllExperiences ? experience : recentExperience;
  }, [experience, recentExperience, showAllExperiences]);

  useEffect(() => {
    const keyQuestions =
      profile?.keyQuestions && typeof profile.keyQuestions === "object" && !Array.isArray(profile.keyQuestions)
        ? (profile.keyQuestions as Record<string, unknown>)
        : {};
    const roleFocus = String(keyQuestions.roleFocus ?? "").trim();
    const availability = String(keyQuestions.availability ?? "asap").trim() || "asap";

    const existingBenefits =
      Array.isArray(profile?.benefitSelections) && profile?.benefitSelections.length
        ? (profile.benefitSelections[0] as { selectedPlan?: unknown; benefits?: unknown[] })
        : null;

    const rawLocations = Array.isArray(profile?.workplaceLocations) ? profile.workplaceLocations : [];

    const workplaceLocations = rawLocations
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        return String((item as { label?: unknown }).label ?? "").trim();
      })
      .filter((item): item is string => Boolean(item));

    setPreferencesForm({
      roleFocus,
      availability,
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

  async function savePersonalDetails() {
    try {
      setSavingPersonalDetails(true);
      setError(null);

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(personalDetailsForm),
      });

      const data = await readJsonResponse<{
        ok?: boolean;
        error?: string;
        profile?: ProfileApiResponse["profile"];
      }>(res);

      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to save personal details.");
      }

      if (data?.profile) {
        setProfile(data.profile);
      }

      setIsEditingPersonal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save personal details.");
    } finally {
      setSavingPersonalDetails(false);
    }
  }

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
      setResumeUploadSuccess(
        `Resume uploaded and parsed. ${count} experience record${count === 1 ? "" : "s"} saved.`
      );
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

  function startEditExperience(exp: ExperienceItem) {
    setEditingExperienceId(exp.id);
    setEditingBullets(exp.bullets.length ? exp.bullets : [""]);
  }

  function cancelEditExperience() {
    setEditingExperienceId(null);
    setEditingBullets([]);
  }

  function updateEditingBullet(index: number, value: string) {
    setEditingBullets((prev) => prev.map((item, i) => (i === index ? value : item)));
  }

  function addEditingBullet() {
    setEditingBullets((prev) => [...prev, ""]);
  }

  function removeEditingBullet(index: number) {
    setEditingBullets((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveExperienceBullets() {
    if (!editingExperienceId) return;

    const nextBullets = editingBullets.map((item) => item.trim()).filter(Boolean);

    try {
      setSavingExperience(true);
      setError(null);

      const res = await fetch("/api/resume/experience", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: editingExperienceId,
          bullets: nextBullets,
        }),
      });

      const data = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to save experience bullets.");
      }

      setProfile((prev) => {
        if (!prev?.resume) return prev;

        return {
          ...prev,
          resume: {
            ...prev.resume,
            experiences: prev.resume.experiences.map((exp) => {
              if (exp.id !== editingExperienceId) return exp;

              return {
                ...exp,
                bullets: nextBullets.map((text, index) => ({
                  id: `${exp.id}-bullet-${index}`,
                  text,
                })),
              };
            }),
          },
        };
      });

      cancelEditExperience();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save experience bullets.");
    } finally {
      setSavingExperience(false);
    }
  }

  function startEditPersonal() {
    setPersonalDetailsForm({
      firstName: profile?.firstName ?? "",
      lastName: profile?.lastName ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      address: profile?.address ?? "",
      city: profile?.city ?? "",
      state: profile?.state ?? "",
      postalCode: profile?.postalCode ?? "",
      linkedinUrl: profile?.linkedinUrl ?? "",
      portfolioUrl: profile?.portfolioUrl ?? "",
    });
    setIsEditingPersonal(true);
  }

// ✅ Replace your ToggleField with this version (fixes the thumb alignment + looks like a real switch)

function ToggleField({
  label,
  checked,
  onChange,
  checkedLabel = "Include remote",
  uncheckedLabel = "Exclude remote",
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  checkedLabel?: string;
  uncheckedLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-semibold text-slate-700">{label}</div>

      <div
        className={[
          "flex items-center justify-between gap-3 rounded-xl border px-3 py-2",
          checked ? "border-sky-300 bg-sky-50" : "border-slate-300 bg-white",
        ].join(" ")}
      >
        <span className={checked ? "text-sky-700 text-sm font-semibold" : "text-slate-700 text-sm font-semibold"}>
          {checked ? checkedLabel : uncheckedLabel}
        </span>

        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={[
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-white",
            checked ? "bg-sky-500" : "bg-slate-300",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
              checked ? "translate-x-5" : "translate-x-1",
            ].join(" ")}
          />
        </button>
      </div>
    </div>
  );
}

  function cancelEditPersonal() {
    setIsEditingPersonal(false);
    setError(null);
    setPersonalDetailsForm({
      firstName: profile?.firstName ?? "",
      lastName: profile?.lastName ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      address: profile?.address ?? "",
      city: profile?.city ?? "",
      state: profile?.state ?? "",
      postalCode: profile?.postalCode ?? "",
      linkedinUrl: profile?.linkedinUrl ?? "",
      portfolioUrl: profile?.portfolioUrl ?? "",
    });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto w-full max-w-6xl px-4 py-12">
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <section className="lg:col-span-5">
            {/* =======================
                PERSONAL DETAILS
               ======================= */}
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="text-black text-md mb-2">Personal Information:</div>
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
                  className={`${SKY_BTN_SOFT} inline-flex items-center gap-2`}
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

              {/* Header row */}
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Personal details</div>

                {!isEditingPersonal ? (
                  <button type="button" onClick={startEditPersonal} className={SKY_BTN_SOFT_SM}>
                    <PencilSquareIcon className="h-4 w-4" />
                    Edit
                  </button>
                ) : (
                  <button type="button" onClick={cancelEditPersonal} className={SKY_BTN_MUTED}>
                    Cancel
                  </button>
                )}
              </div>

              {/* View mode */}
              {!isEditingPersonal ? (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FieldRow label="First name" value={profile?.firstName ?? "Not provided in database"} />
                    <FieldRow label="Last name" value={profile?.lastName ?? "Not provided in database"} />
                  </div>

                  <div className="grid gap-3">
                    <FieldRow label="Email" value={profile?.email ?? "Not provided in database"} />
                    <FieldRow label="Phone number" value={profile?.phone ?? "Not provided in database"} />
                    <FieldRow label="Address" value={profile?.address ?? "Not provided in database"} />
                    <FieldRow label="City" value={profile?.city ?? "Not provided in database"} />
                    <FieldRow label="State" value={profile?.state ?? "Not provided in database"} />
                    <FieldRow label="Postal code" value={profile?.postalCode ?? "Not provided in database"} />
                    <FieldRow label="LinkedIn" value={profile?.linkedinUrl ?? "Not provided in database"} />
                    <FieldRow label="Portfolio" value={profile?.portfolioUrl ?? "Not provided in database"} />
                  </div>

                  {loading ? <p className={`mt-4 text-sm ${NON_DB_TEXT_CLASS}`}>Loading profile from database…</p> : null}
                  {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
                </div>
              ) : (
                /* Edit mode */
                <div className="mt-4 space-y-4">
                  {/* First/Last name = 2 columns */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField
                      label="First name"
                      value={personalDetailsForm.firstName}
                      onChange={(value) => setPersonalDetailsForm((prev) => ({ ...prev, firstName: value }))}
                    />
                    <TextField
                      label="Last name"
                      value={personalDetailsForm.lastName}
                      onChange={(value) => setPersonalDetailsForm((prev) => ({ ...prev, lastName: value }))}
                    />
                  </div>

                  {/* Everything else = single column */}
                  <div className="grid gap-3">
                    <TextField
                      label="Email"
                      value={personalDetailsForm.email}
                      onChange={(value) => setPersonalDetailsForm((prev) => ({ ...prev, email: value }))}
                    />
                    <TextField
                      label="Phone number"
                      value={personalDetailsForm.phone}
                      onChange={(value) => setPersonalDetailsForm((prev) => ({ ...prev, phone: value }))}
                    />
                    <TextField
                      label="Address"
                      value={personalDetailsForm.address}
                      onChange={(value) => setPersonalDetailsForm((prev) => ({ ...prev, address: value }))}
                    />
                    <TextField
                      label="City"
                      value={personalDetailsForm.city}
                      onChange={(value) => setPersonalDetailsForm((prev) => ({ ...prev, city: value }))}
                    />
                    <TextField
                      label="State"
                      value={personalDetailsForm.state}
                      onChange={(value) => setPersonalDetailsForm((prev) => ({ ...prev, state: value }))}
                    />
                    <TextField
                      label="Postal code"
                      value={personalDetailsForm.postalCode}
                      onChange={(value) => setPersonalDetailsForm((prev) => ({ ...prev, postalCode: value }))}
                    />
                    <TextField
                      label="LinkedIn"
                      value={personalDetailsForm.linkedinUrl}
                      onChange={(value) => setPersonalDetailsForm((prev) => ({ ...prev, linkedinUrl: value }))}
                    />
                    <TextField
                      label="Portfolio"
                      value={personalDetailsForm.portfolioUrl}
                      onChange={(value) => setPersonalDetailsForm((prev) => ({ ...prev, portfolioUrl: value }))}
                    />
                  </div>

                  {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

                  <button
                    type="button"
                    onClick={() => void savePersonalDetails()}
                    disabled={savingPersonalDetails}
                    className={`${SKY_BTN_PRIMARY} w-full`}
                  >
                    {savingPersonalDetails ? "Saving changes..." : "Save changes"}
                  </button>
                </div>
              )}
            </Card>

            {/* =======================
                PREFERENCES
               ======================= */}
            <Card className="p-6 mt-2">
              <div className={`text-sm font-semibold ${NON_DB_TEXT_CLASS}`}>Job-matching signals</div>
              <p className={`mt-2 text-sm ${NON_DB_TEXT_CLASS}`}>
                Add more details (roles, locations, salary, availability) to boost match quality.
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Minimum salary: <span className="font-semibold">{formattedMinCompensation}</span>
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

                    <TextField
                      label="Minimum salary"
                      value={String(preferencesForm.minCompensation)}
                      onChange={(value) =>
                        setPreferencesForm((prev) => ({
                          ...prev,
                          // keep only digits, then convert
                          minCompensation: Number(value.replace(/[^\d]/g, "")) || 0,
                        }))
                      }
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

              <ToggleField
                label="Remote preference"
                checked={preferencesForm.includeRemote}
                checkedLabel="Remote"
                uncheckedLabel="Remote"
                onChange={(checked) =>
                  setPreferencesForm((prev) => ({
                    ...prev,
                    includeRemote: checked,
                  }))
                }
              />

                    {/* <SelectField
                      label="Benefits plan"
                      value={preferencesForm.selectedPlan}
                      onChange={(value) =>
                        setPreferencesForm((prev) => ({
                          ...prev,
                          selectedPlan: value === "annual" ? "annual" : "trial",
                        }))
                      }
                      options={["trial", "annual"]}
                    /> */}
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
                              ? "border-sky-300 bg-sky-50 text-sky-700"
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
                    className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingPreferences ? "Saving..." : "Save Preferences"}
                  </button>
                </div>
              ) : null}
            </Card>

            {/* =======================
                SUBSCRIPTION
               ======================= */}
            <Card className="p-6 mt-2">
              <div className="text-sm font-semibold text-slate-900">Subscription Status</div>

              <div className="mt-4">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center">
                  <div className="text-xs font-semibold text-slate-500">Current Status</div>

                  <div
                    className={`mt-2 text-lg font-bold ${
                      subscriptionSummary.planStatus === "active" ? "text-sky-500" : "text-red-500"
                    }`}
                  >
                    {subscriptionSummary.planStatus === "active" ? "Active" : "Inactive"}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 mt-2">
              <div className="text-sm font-semibold text-slate-900">
                HirePilot AI Interview Assistant
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-5">
                <div className="text-xs font-semibold text-slate-500">Access Status</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {hirePilotStatus?.hirePilotUnlimited
                    ? "Status: Unlimited Access"
                    : (hirePilotStatus?.hirePilotCredits ?? 0) > 0
                    ? `Credits Remaining: ${hirePilotStatus?.hirePilotCredits ?? 0}`
                    : "No HirePilot access"}
                </div>

                <a
                  href="/hirepilot"
                  className="mt-4 inline-flex items-center justify-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                >
                  Unlock HirePilot
                </a>
              </div>
            </Card>

            {/* =======================
                SNAPSHOT
               ======================= */}
            {/* <Card className="p-6">
              <div className="text-sm font-semibold text-slate-900">Database profile snapshot</div>
              <p className={`mt-2 text-sm ${NON_DB_TEXT_CLASS}`}>
                Live data returned from <code>/api/profile</code> for the logged-in user.
              </p>
              <pre className="mt-4 max-h-[28rem] overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100">
                {databaseSnapshot}
              </pre>
            </Card> */}
          </section>

          {/* =======================
              RIGHT COLUMN
             ======================= */}
          <section className="lg:col-span-7">
            <div className="space-y-6">
              <Card className="p-6">
                <div className="flex-col items-start justify-between gap-4">
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-md font-semibold text-slate-700">Resume:</div>
                      <button
                        type="button"
                        onClick={() => resumeInputRef.current?.click()}
                        disabled={uploadingResume}
                        className={`${SKY_BTN_SOFT_SM} ${NON_DB_TEXT_CLASS}`}
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
                    {resumeUploadSuccess ? <p className="mt-2 text-xs text-sky-500">{resumeUploadSuccess}</p> : null}
                    {resumeUploadError ? <p className="mt-2 text-xs text-red-600">{resumeUploadError}</p> : null}
                  </div>

                  <div className="mt-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-md font-semibold text-slate-700">Experience: </div>

                      <button type="button" className={`${SKY_BTN_SOFT_SM} ${NON_DB_TEXT_CLASS}`}>
                        + Add experience
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {experience.length > 4 && !showAllExperiences ? (
                        <p className={`text-xs ${NON_DB_TEXT_CLASS}`}>Showing the 4 most recent experience records.</p>
                      ) : null}

                      {visibleExperience.length === 0 ? (
                        <p className={`text-sm ${NON_DB_TEXT_CLASS}`}>No experience rows found in database.</p>
                      ) : null}

                      {visibleExperience.map((exp) => {
                        const open = !!expandedExp[exp.id];
                        const bullets = open ? exp.bullets : exp.bullets.slice(0, 2);
                        const showToggle = exp.bullets.length > 2;
                        const isEditing = editingExperienceId === exp.id;

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
                                  className="rounded-xl p-2 text-sky-500 hover:bg-slate-50"
                                  onClick={() => startEditExperience(exp)}
                                >
                                  <PencilSquareIcon className="h-5 w-5" />
                                </button>

                                <button
                                  type="button"
                                  aria-label="Delete experience"
                                  className="rounded-xl p-2 text-sky-500 hover:bg-slate-50"
                                  onClick={() => removeFromList(exp.id)}
                                >
                                  <TrashIcon className="h-5 w-5" />
                                </button>
                              </div>
                            </div>

                            {isEditing ? (
                              <div className="mt-3 space-y-2">
                                {editingBullets.map((bullet, index) => (
                                  <div key={`${exp.id}-edit-${index}`} className="space-y-1">
                                    <textarea
                                      value={bullet}
                                      onChange={(event) => updateEditingBullet(index, event.target.value)}
                                      rows={2}
                                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
                                      placeholder="Enter bullet"
                                    />
                                    {editingBullets.length > 1 ? (
                                      <button
                                        type="button"
                                        className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                                        onClick={() => removeEditingBullet(index)}
                                      >
                                        Remove bullet
                                      </button>
                                    ) : null}
                                  </div>
                                ))}

                                <button
                                  type="button"
                                  onClick={addEditingBullet}
                                  className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                                >
                                  + Add bullet
                                </button>

                                <div className="flex items-center gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={saveExperienceBullets}
                                    disabled={savingExperience}
                                    className={SKY_BTN_SOFT_SM}
                                  >
                                    {savingExperience ? "Saving…" : "Save"}
                                  </button>
                                  <button type="button" onClick={cancelEditExperience} className={SKY_BTN_MUTED}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                                {bullets.map((b, i) => (
                                  <li key={i}>{b}</li>
                                ))}
                              </ul>
                            )}

                            {showToggle && !isEditing ? (
                              <button
                                type="button"
                                onClick={() => toggleExp(exp.id)}
                                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-500 hover:text-sky-600"
                              >
                                {open ? "Show less" : "Show more"}
                                {open ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}

                      {/* ✅ SHOW MORE / SHOW LESS (ALL EXPERIENCES) */}
                      {experience.length > 4 ? (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setShowAllExperiences((prev) => !prev)}
                            className="w-full rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
                          >
                            {showAllExperiences ? `Show less` : `Show more (${experience.length - 4} more)`}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
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
          <div className={`mt-1 truncate text-sm font-semibold ${isDbFallback ? "text-sky-500" : "text-slate-900"}`}>
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
      />
    </label>
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
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
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
