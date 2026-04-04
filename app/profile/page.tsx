// E:\Web Applications\Hirexa\my-app\app\profile\page.tsx
"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpTrayIcon,
  PencilSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { formatSalary, type CompensationType } from "@/app/lib/salary";
import { ALL_BENEFIT_OPTIONS } from "@/app/lib/benefits/catalog";
import {
  getLocationSuggestions,
  normalizeLocationLabel,
  type LocationSuggestion,
} from "@/app/lib/locationOptions";
import { calculateProfileStrength } from "@/app/lib/profile/profileStrength";

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
  employmentType: string;
  seniorityLevel: string;
  compensationType: "yearly" | "hourly";
  minCompensation: number;
  includeRemote: boolean;
  workplaceLocations: string[];
  benefits: string[];
};

type NewExperienceForm = {
  title: string;
  company: string;
  location: string;
  dateRange: string;
  bullets: string[];
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
    displayAddress?: string | null;
    displayCity?: string | null;
    displayPostalCode?: string | null;
    displayState?: string | null;
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

type ResumeExperienceRecord = NonNullable<
  NonNullable<ProfileApiResponse["profile"]>["resume"]
>["experiences"][number];

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
const AVAILABILITY_OPTIONS = ["asap", "2-weeks", "30-days", "not-looking"];
const EMPLOYMENT_TYPE_OPTIONS = [
  "Full-time",
  "Contract",
  "Part-time",
  "Internship",
  "Freelance",
];
const SENIORITY_LEVEL_OPTIONS = [
  "Entry level",
  "Mid level",
  "Senior",
  "Lead",
  "Manager",
];

const PROFILE_SECTIONS = [
  { id: "personal-info", label: "Personal Info" },
  { id: "professional-links", label: "Professional Links" },
  { id: "education", label: "Education" },
  { id: "experience", label: "Experience" },
  { id: "skills", label: "Skills" },
  { id: "settings", label: "Settings" },
  { id: "job-preferences", label: "Job Preferences" },
  { id: "notifications", label: "Notifications" },
  { id: "privacy-security", label: "Privacy & Security" },
  { id: "ai-profile-sync", label: "AI Profile Sync" },
] as const;

type ProfileSectionId = (typeof PROFILE_SECTIONS)[number]["id"];

function formatProfileDate(value?: string | null, options?: { includeTime?: boolean }) {
  if (!value) return "Not found";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(options?.includeTime
      ? {
          hour: "numeric" as const,
          minute: "2-digit" as const,
        }
      : {}),
  }).format(parsed);
}

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
    employmentType: "Full-time",
    seniorityLevel: "Mid level",
    compensationType: "yearly",
    minCompensation: 50000,
    includeRemote: true,
    workplaceLocations: [],
    benefits: [],
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resumeInputRef = useRef<HTMLInputElement | null>(null);
  const personalDetailsCardRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState<ProfileSectionId>("personal-info");

  // ✅ show all experiences toggle
  const [showAllExperiences, setShowAllExperiences] = useState(false);
  const [editingExperienceId, setEditingExperienceId] = useState<string | null>(null);
  const [editingBullets, setEditingBullets] = useState<string[]>([]);
  const [savingExperience, setSavingExperience] = useState(false);
  const [isAddingExperience, setIsAddingExperience] = useState(false);
  const [addingExperience, setAddingExperience] = useState(false);
  const [newExperienceForm, setNewExperienceForm] = useState<NewExperienceForm>({
    title: "",
    company: "",
    location: "",
    dateRange: "",
    bullets: [""],
  });

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

      if (process.env.NODE_ENV !== "production") {
        console.log("[profile page] received payload", {
          profileId: data?.profile?.id ?? null,
          address: data?.profile?.displayAddress ?? data?.profile?.address ?? null,
          city: data?.profile?.displayCity ?? data?.profile?.city ?? null,
          state: data?.profile?.displayState ?? data?.profile?.state ?? null,
          postalCode:
            data?.profile?.displayPostalCode ?? data?.profile?.postalCode ?? null,
        });
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
      address: profile?.displayAddress ?? profile?.address ?? "",
      city: profile?.displayCity ?? profile?.city ?? "",
      state: profile?.displayState ?? profile?.state ?? "",
      postalCode: profile?.displayPostalCode ?? profile?.postalCode ?? "",
      linkedinUrl: profile?.linkedinUrl ?? "",
      portfolioUrl: profile?.portfolioUrl ?? "",
    });
  }, [profile, isEditingPersonal]);

  const displayPersonalDetails = useMemo(
    () => ({
      address: profile?.displayAddress ?? profile?.address ?? "Not provided in database",
      city: profile?.displayCity ?? profile?.city ?? "Not provided in database",
      state: profile?.displayState ?? profile?.state ?? "Not provided in database",
      postalCode:
        profile?.displayPostalCode ?? profile?.postalCode ?? "Not provided in database",
    }),
    [
      profile?.address,
      profile?.city,
      profile?.displayAddress,
      profile?.displayCity,
      profile?.displayPostalCode,
      profile?.displayState,
      profile?.postalCode,
      profile?.state,
    ]
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && profile) {
      console.log("[profile page] render values", {
        profileId: profile.id,
        address: displayPersonalDetails.address,
        city: displayPersonalDetails.city,
        state: displayPersonalDetails.state,
        postalCode: displayPersonalDetails.postalCode,
      });
    }
  }, [displayPersonalDetails, profile]);

  const name =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "Not provided in database";

  const subscriptionSummary = useMemo(
    () => ({
      email: profile?.subscriptionEmail ?? profile?.email ?? "Not found",
      isSubscribed: Boolean(profile?.trialSubscriber || profile?.monthlySubscriber || profile?.yearlySubscriber)
        ? "Yes"
        : "No",
      planStatus: profile?.trialPlanStatus ?? profile?.monthlyPlanStatus ?? profile?.yearlyPlanStatus ?? "none",
      purchasedAt: formatProfileDate(profile?.subscriptionPurchasedAt),
      checkedAt: formatProfileDate(profile?.subscriptionCheckedAt),
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
  const hirexaBillingActive = useMemo(
    () => isActiveBillingStatus(subscriptionSummary.planStatus),
    [subscriptionSummary.planStatus]
  );
  const hirepilotBillingActive = useMemo(
    () =>
      Boolean(
        hirePilotStatus?.hirePilotUnlimited || (hirePilotStatus?.hirePilotCredits ?? 0) > 0
      ),
    [hirePilotStatus?.hirePilotCredits, hirePilotStatus?.hirePilotUnlimited]
  );

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
    const employmentType = String(keyQuestions.employmentType ?? "Full-time").trim() || "Full-time";
    const seniorityLevel = String(keyQuestions.seniorityLevel ?? "Mid level").trim() || "Mid level";

    const existingBenefits =
      Array.isArray(profile?.benefitSelections) && profile?.benefitSelections.length
        ? (profile.benefitSelections[0] as { benefits?: unknown[] })
        : null;

    const rawLocations = Array.isArray(profile?.workplaceLocations) ? profile.workplaceLocations : [];

    const workplaceLocations = rawLocations
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        return normalizeLocationLabel(String((item as { label?: unknown }).label ?? ""));
      })
      .filter((item): item is string => Boolean(item));

    setPreferencesForm({
      roleFocus,
      availability,
      employmentType,
      seniorityLevel,
      compensationType: profile?.compensationType === "hourly" ? "hourly" : "yearly",
      minCompensation: Math.max(0, profile?.minCompensation ?? 50000),
      includeRemote: profile?.includeRemote ?? true,
      workplaceLocations,
      benefits: Array.isArray(existingBenefits?.benefits)
        ? existingBenefits.benefits.map((item) => String(item)).filter(Boolean)
        : [],
    });
  }, [profile]);

  const savedTargetRole = useMemo(() => {
    const normalized = preferencesForm.roleFocus.trim();
    return normalized || "Not provided in database";
  }, [preferencesForm.roleFocus]);

  const savedSmartMatchesLocation = useMemo(() => {
    const city = profile?.displayCity ?? profile?.city ?? "";
    const state = profile?.displayState ?? profile?.state ?? "";
    const personalInfoLocation = [city, state].filter(Boolean).join(", ").trim();
    if (personalInfoLocation) {
      return personalInfoLocation;
    }

    const fallbackLocation = normalizeLocationLabel(
      preferencesForm.workplaceLocations[0] ?? ""
    );

    return fallbackLocation || "Not provided in database";
  }, [
    preferencesForm.workplaceLocations,
    profile?.city,
    profile?.displayCity,
    profile?.displayState,
    profile?.state,
  ]);

  const profileStrength = useMemo(() => calculateProfileStrength(profile ?? null), [profile]);
  const topStrengthActions = useMemo(
    () => profileStrength.missingItems.slice(0, 4),
    [profileStrength.missingItems]
  );
  const combinedSkills = useMemo(
    () => profileStrength.combinedSkills,
    [profileStrength.combinedSkills]
  );
  const newsletterStatus = profile?.unsubscribedAt
    ? "Unsubscribed"
    : profile?.newsletterOptIn
      ? "Subscribed"
      : "Not subscribed";
  const securityStatus = profile?.emailVerifiedAt ? "Verified" : "Pending";

  useEffect(() => {
    const sections = PROFILE_SECTIONS.map((section) =>
      document.getElementById(section.id)
    ).filter((section): section is HTMLElement => Boolean(section));

    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        const nextSection = visibleEntries[0]?.target.id as ProfileSectionId | undefined;
        if (nextSection) {
          setActiveSection(nextSection);
        }
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0.2, 0.45, 0.7],
      }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash.replace(/^#/, "");
    const matchedSection = PROFILE_SECTIONS.find((section) => section.id === hash);
    if (matchedSection) {
      setActiveSection(matchedSection.id);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nextHash = `#${activeSection}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }, [activeSection]);

  function openSmartMatchesLocationEditor() {
    startEditPersonal();
    personalDetailsCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openPersonalDetailsEditor() {
    startEditPersonal();
    personalDetailsCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToSection(sectionId: ProfileSectionId) {
    const target = document.getElementById(sectionId);
    if (!target) return;

    setActiveSection(sectionId);
    window.history.replaceState(null, "", `#${sectionId}`);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
          employmentType: preferencesForm.employmentType,
          seniorityLevel: preferencesForm.seniorityLevel,
          compensationType: preferencesForm.compensationType,
          minCompensation: preferencesForm.minCompensation,
          includeRemote: preferencesForm.includeRemote,
          workplaceLocations: preferencesForm.workplaceLocations.length
            ? preferencesForm.workplaceLocations.map((label) => ({ label }))
            : null,
          benefits: preferencesForm.benefits,
        }),
      });

      const data = await readJsonResponse<{
        ok?: boolean;
        error?: string;
        preferences?: {
          workplaceLocations?: Array<{ label: string }> | null;
          includeRemote?: boolean;
          roleFocus?: string;
          availability?: string;
          employmentType?: string;
          seniorityLevel?: string;
          benefits?: string[];
        };
      }>(res);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to save preferences.");
      }

      const normalizedWorkplaceLocations =
        data?.preferences?.workplaceLocations?.map((item) => item.label).filter(Boolean) ??
        preferencesForm.workplaceLocations
          .map((label) => normalizeLocationLabel(label))
          .filter(Boolean);
      const normalizedBenefits = data?.preferences?.benefits ?? preferencesForm.benefits;

      setProfile((prev) => {
        if (!prev) return prev;

        return {
          ...prev,
          minCompensation: preferencesForm.minCompensation,
          compensationType: preferencesForm.compensationType,
          includeRemote: data?.preferences?.includeRemote ?? preferencesForm.includeRemote,
          workplaceLocations: normalizedWorkplaceLocations.map((label) => ({ label })),
          keyQuestions: {
            ...(prev.keyQuestions &&
            typeof prev.keyQuestions === "object" &&
            !Array.isArray(prev.keyQuestions)
              ? (prev.keyQuestions as Record<string, unknown>)
              : {}),
            roleFocus: data?.preferences?.roleFocus ?? preferencesForm.roleFocus,
            availability: data?.preferences?.availability ?? preferencesForm.availability,
            employmentType:
              data?.preferences?.employmentType ?? preferencesForm.employmentType,
            seniorityLevel:
              data?.preferences?.seniorityLevel ?? preferencesForm.seniorityLevel,
          },
          benefitSelections: prev.benefitSelections?.length
            ? prev.benefitSelections.map((selection, index) =>
                index === 0 && selection && typeof selection === "object"
                  ? {
                      ...(selection as Record<string, unknown>),
                      benefits: normalizedBenefits,
                    }
                  : selection
              )
            : [
                {
                  benefits: normalizedBenefits,
                },
              ],
        };
      });

      setPreferencesForm((prev) => ({
        ...prev,
        includeRemote: data?.preferences?.includeRemote ?? prev.includeRemote,
        workplaceLocations: normalizedWorkplaceLocations,
        benefits: normalizedBenefits,
        roleFocus: data?.preferences?.roleFocus ?? prev.roleFocus,
        availability: data?.preferences?.availability ?? prev.availability,
        employmentType: data?.preferences?.employmentType ?? prev.employmentType,
        seniorityLevel: data?.preferences?.seniorityLevel ?? prev.seniorityLevel,
      }));
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

  function resetNewExperienceForm() {
    setNewExperienceForm({
      title: "",
      company: "",
      location: "",
      dateRange: "",
      bullets: [""],
    });
  }

  function startAddExperience() {
    if (!profile?.resume) {
      setResumeUploadError("Please upload your resume before adding experience.");
      resumeInputRef.current?.click();
      return;
    }

    setResumeUploadError(null);
    setIsAddingExperience(true);
    resetNewExperienceForm();
  }

  function updateNewExperienceField<K extends keyof Omit<NewExperienceForm, "bullets">>(
    key: K,
    value: NewExperienceForm[K]
  ) {
    setNewExperienceForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function updateNewExperienceBullet(index: number, value: string) {
    setNewExperienceForm((prev) => ({
      ...prev,
      bullets: prev.bullets.map((bullet, bulletIndex) =>
        bulletIndex === index ? value : bullet
      ),
    }));
  }

  function addNewExperienceBullet() {
    setNewExperienceForm((prev) => ({
      ...prev,
      bullets: [...prev.bullets, ""],
    }));
  }

  function removeNewExperienceBullet(index: number) {
    setNewExperienceForm((prev) => ({
      ...prev,
      bullets:
        prev.bullets.length === 1
          ? [""]
          : prev.bullets.filter((_, bulletIndex) => bulletIndex !== index),
    }));
  }

  async function saveNewExperience() {
    if (!profile?.resume) {
      setResumeUploadError("Please upload your resume before adding experience.");
      return;
    }

    try {
      setAddingExperience(true);
      setError(null);

      const res = await fetch("/api/resume/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newExperienceForm.title,
          company: newExperienceForm.company,
          location: newExperienceForm.location,
          dateRange: newExperienceForm.dateRange,
          bullets: newExperienceForm.bullets,
        }),
      });

      const data = await readJsonResponse<{
        ok?: boolean;
        error?: string;
        experience?: ResumeExperienceRecord;
      }>(res);

      if (!res.ok || !data?.experience) {
        throw new Error(data?.error ?? "Failed to add experience.");
      }
      const createdExperience = data.experience;

      setProfile((prev) => {
        if (!prev?.resume) return prev;

        return {
          ...prev,
          resume: {
            ...prev.resume,
            experiences: [...prev.resume.experiences, createdExperience],
          },
        };
      });
      setShowAllExperiences(true);
      setIsAddingExperience(false);
      resetNewExperienceForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add experience.");
    } finally {
      setAddingExperience(false);
    }
  }

  function startEditPersonal() {
    setPersonalDetailsForm({
      firstName: profile?.firstName ?? "",
      lastName: profile?.lastName ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      address: profile?.displayAddress ?? profile?.address ?? "",
      city: profile?.displayCity ?? profile?.city ?? "",
      state: profile?.displayState ?? profile?.state ?? "",
      postalCode: profile?.displayPostalCode ?? profile?.postalCode ?? "",
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
      address: profile?.displayAddress ?? profile?.address ?? "",
      city: profile?.displayCity ?? profile?.city ?? "",
      state: profile?.displayState ?? profile?.state ?? "",
      postalCode: profile?.displayPostalCode ?? profile?.postalCode ?? "",
      linkedinUrl: profile?.linkedinUrl ?? "",
      portfolioUrl: profile?.portfolioUrl ?? "",
    });
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto w-full max-w-7xl px-4 py-12">
        <div>
          <p className="text-sm font-semibold text-sky-600">Profile</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Build a stronger Hirexa profile
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Keep your personal details, job preferences, resume history, and account
            settings organized in one place so Hirexa can personalize matches and
            application workflows with less guesswork.
          </p>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="min-w-0">
            <div className="space-y-4 rounded-3xl bg-white lg:sticky lg:top-24">
              <Card className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">
                      Profile Strength
                    </p>
                    <div className="mt-2 text-3xl font-semibold text-slate-900">
                      {profileStrength.score}%
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Calculated from the real profile data, resume, skills, and job
                      preferences already saved to your account.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">
                    {topStrengthActions.length === 0
                      ? "Complete"
                      : `${topStrengthActions.length} next steps`}
                  </div>
                </div>

                <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all"
                    style={{ width: `${profileStrength.score}%` }}
                  />
                </div>

                <div className="mt-5 space-y-2">
                  {topStrengthActions.length ? (
                    topStrengthActions.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 rounded-2xl bg-slate-50 px-3 py-2"
                      >
                        <span
                          className={[
                            "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                            item.impact === "high" ? "bg-sky-500" : "bg-slate-300",
                          ].join(" ")}
                        />
                        <span className="text-sm text-slate-700">{item.label}</span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-700">
                      Your core profile sections are in good shape.
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Sections
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                  {PROFILE_SECTIONS.map((section) => (
                    <SidebarSectionLink
                      key={section.id}
                      href={`#${section.id}`}
                      label={section.label}
                      active={activeSection === section.id}
                      onClick={() => scrollToSection(section.id)}
                    />
                  ))}
                </div>
              </Card>
            </div>
          </aside>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-col gap-6">
          <section className="contents">
            {/* =======================
                PERSONAL DETAILS
               ======================= */}
            <div
              ref={personalDetailsCardRef}
              id="personal-info"
              className="order-1 scroll-mt-28"
            >
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
                    <FieldRow label="Address" value={displayPersonalDetails.address} />
                    <FieldRow label="City" value={displayPersonalDetails.city} />
                    <FieldRow label="State" value={displayPersonalDetails.state} />
                    <FieldRow label="Postal code" value={displayPersonalDetails.postalCode} />
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
            </div>

            <section id="professional-links" className="order-2 scroll-mt-28">
              <Card className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Professional Links
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Add the links recruiters and application flows are most likely
                      to use.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openPersonalDetailsEditor}
                    className={SKY_BTN_SOFT_SM}
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                    Edit links
                  </button>
                </div>

                <div className="mt-4 grid gap-3">
                  <FieldRow
                    label="LinkedIn"
                    value={profile?.linkedinUrl ?? "Not provided in database"}
                  />
                  <FieldRow
                    label="Personal website"
                    value={profile?.portfolioUrl ?? "Not provided in database"}
                  />
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  Additional link types like GitHub, Dribbble, Behance, and X are not
                  wired into editable profile fields yet.
                </p>
              </Card>
            </section>

            {/* =======================
                PREFERENCES
               ======================= */}
            <section id="job-preferences" className="order-7 scroll-mt-28">
            <Card className="p-6 mt-2">
              <div className={`text-sm font-semibold ${NON_DB_TEXT_CLASS}`}>Job-matching signals</div>
              <p className={`mt-2 text-sm ${NON_DB_TEXT_CLASS}`}>
                Add more details (roles, locations, salary, availability) to boost match quality.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <FieldRow label="Target role" value={savedTargetRole} />
                <FieldRow
                  label="Smart Matches default location"
                  value={savedSmartMatchesLocation}
                />
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Minimum salary: <span className="font-semibold">{formattedMinCompensation}</span>
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Target role is saved in Job-matching signals. Smart Matches default
                location comes from Personal details city and state, and only falls
                back to the saved location preference if city/state is blank.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setShowPreferenceEditor((prev) => !prev)}
                  className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {showPreferenceEditor ? "Hide Preferences" : "Update Preferences"}
                </button>
                <button
                  type="button"
                  onClick={openSmartMatchesLocationEditor}
                  className={SKY_BTN_MUTED}
                >
                  Edit City & State
                </button>
              </div>

              {showPreferenceEditor ? (
                <div className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField
                      label="Target role"
                      value={preferencesForm.roleFocus}
                      onChange={(value) => setPreferencesForm((prev) => ({ ...prev, roleFocus: value }))}
                    />

                    <SelectField
                      label="Availability"
                      value={preferencesForm.availability}
                      onChange={(value) => setPreferencesForm((prev) => ({ ...prev, availability: value }))}
                      options={AVAILABILITY_OPTIONS}
                    />

                    <SelectField
                      label="Employment type"
                      value={preferencesForm.employmentType}
                      onChange={(value) =>
                        setPreferencesForm((prev) => ({ ...prev, employmentType: value }))
                      }
                      options={EMPLOYMENT_TYPE_OPTIONS}
                    />

                    <SelectField
                      label="Seniority level"
                      value={preferencesForm.seniorityLevel}
                      onChange={(value) =>
                        setPreferencesForm((prev) => ({ ...prev, seniorityLevel: value }))
                      }
                      options={SENIORITY_LEVEL_OPTIONS}
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

                    <LocationAutocompleteField
                      label="Fallback location (used only when city/state is blank)"
                      value={preferencesForm.workplaceLocations[0] ?? ""}
                      onChange={(value) =>
                        setPreferencesForm((prev) => ({
                          ...prev,
                          workplaceLocations: value.trim() ? [value] : [],
                        }))
                      }
                    />

                    <ToggleField
                      label="Remote"
                      checked={preferencesForm.includeRemote}
                      checkedLabel="On"
                      uncheckedLabel="Off"
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
                      {ALL_BENEFIT_OPTIONS.map((benefit) => (
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
            </section>

            {/* =======================
                SUBSCRIPTION
               ======================= */}
            <section id="settings" className="order-6 scroll-mt-28">
            <Card className="p-6 mt-2">
              <div className="text-sm font-semibold text-slate-900">Billing & Access</div>
              <p className="mt-2 text-sm text-slate-600">
                Manage product status, billing, and interview access from the current
                profile view or open full controls in Settings.
              </p>

              <div className="mt-4 space-y-4">
                <BillingStatusCard
                  title="Hirexa AI"
                  subtitle="Core Hirexa AI subscription and billing status"
                  status={hirexaBillingActive ? "Active" : "Inactive"}
                  compact={!hirexaBillingActive}
                  actions={
                    <>
                      <a
                        href="/settings/subscription"
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {hirexaBillingActive ? "Manage Billing" : "View Plans & Billing"}
                      </a>
                      <a
                        href="/settings/subscription"
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Open Subscription Settings
                      </a>
                    </>
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FieldRow label="Plan status" value={subscriptionSummary.planStatus || "Active"} />
                    <FieldRow label="Billing email" value={subscriptionSummary.email} />
                    <FieldRow label="Purchased at" value={subscriptionSummary.purchasedAt} />
                    <FieldRow label="Last checked" value={subscriptionSummary.checkedAt} />
                  </div>
                </BillingStatusCard>

                <BillingStatusCard
                  title="HirePilot"
                  subtitle="Interview billing, recurring plan state, and available credits"
                  status={hirepilotBillingActive ? "Active" : "Inactive"}
                  compact={!hirepilotBillingActive}
                  actions={
                    <a
                      href="/hirepilot"
                      className={[
                        "rounded-xl px-4 py-2 text-sm font-semibold",
                        hirepilotBillingActive
                          ? "bg-sky-500 text-white hover:bg-sky-600"
                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {hirepilotBillingActive ? "Open HirePilot" : "Unlock HirePilot"}
                    </a>
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FieldRow
                      label="Access"
                      value={
                        hirePilotStatus?.hirePilotUnlimited
                          ? "Unlimited access"
                          : `Credits remaining: ${hirePilotStatus?.hirePilotCredits ?? 0}`
                      }
                    />
                    <FieldRow
                      label="Recurring status"
                      value={
                        hirePilotStatus?.hirePilotUnlimited
                          ? "Active"
                          : (hirePilotStatus?.hirePilotCredits ?? 0) > 0
                            ? "Credits available"
                            : "Inactive"
                      }
                    />
                  </div>
                </BillingStatusCard>
              </div>
            </Card>
            </section>

            <section id="notifications" className="order-8 scroll-mt-28">
              <Card className="p-6 mt-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Notifications</div>
                    <p className="mt-2 text-sm text-slate-600">
                      Track how Hirexa can reach you about product updates and job-search activity.
                    </p>
                  </div>
                  <Link href="/settings/notifications" className={SKY_BTN_SOFT_SM}>
                    Open Notifications
                  </Link>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <FieldRow label="Marketing email status" value={newsletterStatus} />
                  <FieldRow
                    label="Primary contact email"
                    value={profile?.email ?? "Not provided in database"}
                  />
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  Notification toggles live in Settings so product emails and marketing
                  preferences stay in one place.
                </p>
              </Card>
            </section>

            <section id="privacy-security" className="order-9 scroll-mt-28">
              <Card className="p-6 mt-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Privacy & Security
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Review verification status and jump to the account controls that already exist.
                    </p>
                  </div>
                  <Link href="/settings/account/password" className={SKY_BTN_SOFT_SM}>
                    Change Password
                  </Link>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <FieldRow label="Email status" value={securityStatus} />
                  <FieldRow
                    label="Registration status"
                    value={profile?.registrationStatus ?? "Not found"}
                  />
                  <FieldRow label="Created" value={formatProfileDate(profile?.createdAt)} />
                  <FieldRow label="Updated" value={formatProfileDate(profile?.updatedAt)} />
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href="/settings/account/password"
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Password & Security
                  </Link>
                  <Link
                    href="/settings"
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Delete Profile
                  </Link>
                </div>
              </Card>
            </section>

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
          <section className="contents">
            <div className="space-y-6">
              <section id="skills" className="order-5 scroll-mt-28">
                <Card className="p-6">
                  <div className="text-sm font-semibold text-slate-900">Skills</div>
                  <p className="mt-2 text-sm text-slate-600">
                    Hirexa uses saved skills from onboarding and resume parsing to
                    personalize matching and AI output.
                  </p>

                  {combinedSkills.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {combinedSkills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className={`mt-4 text-sm ${NON_DB_TEXT_CLASS}`}>
                      No skills found yet. Upload a resume or complete onboarding to
                      populate your skill profile.
                    </p>
                  )}

                  <p className="mt-3 text-xs text-slate-500">
                    {combinedSkills.length
                      ? `${combinedSkills.length} skill${combinedSkills.length === 1 ? "" : "s"} currently available across your saved profile and resume data.`
                      : "Adding at least 3 skills will improve your profile strength and job matching."}
                  </p>
                </Card>
              </section>

              <section id="experience" className="order-4 scroll-mt-28">
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

                      <button
                        type="button"
                        onClick={startAddExperience}
                        className={`${SKY_BTN_SOFT_SM} ${NON_DB_TEXT_CLASS}`}
                      >
                        + Add experience
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {isAddingExperience ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <TextField
                              label="Job title"
                              value={newExperienceForm.title}
                              onChange={(value) => updateNewExperienceField("title", value)}
                            />
                            <TextField
                              label="Company"
                              value={newExperienceForm.company}
                              onChange={(value) => updateNewExperienceField("company", value)}
                            />
                            <TextField
                              label="Location"
                              value={newExperienceForm.location}
                              onChange={(value) => updateNewExperienceField("location", value)}
                            />
                            <TextField
                              label="Date range"
                              value={newExperienceForm.dateRange}
                              onChange={(value) => updateNewExperienceField("dateRange", value)}
                            />
                          </div>

                          <div className="mt-4 space-y-2">
                            <div className="text-xs font-semibold text-slate-700">Highlights</div>
                            {newExperienceForm.bullets.map((bullet, index) => (
                              <div key={`new-bullet-${index}`} className="space-y-1">
                                <textarea
                                  value={bullet}
                                  onChange={(event) =>
                                    updateNewExperienceBullet(index, event.target.value)
                                  }
                                  rows={2}
                                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
                                  placeholder="Add a responsibility or accomplishment"
                                />
                                {newExperienceForm.bullets.length > 1 ? (
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                                    onClick={() => removeNewExperienceBullet(index)}
                                  >
                                    Remove bullet
                                  </button>
                                ) : null}
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={addNewExperienceBullet}
                              className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                            >
                              + Add bullet
                            </button>
                          </div>

                          <div className="mt-4 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void saveNewExperience()}
                              disabled={addingExperience}
                              className={SKY_BTN_SOFT_SM}
                            >
                              {addingExperience ? "Saving..." : "Save experience"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsAddingExperience(false);
                                resetNewExperienceForm();
                              }}
                              className={SKY_BTN_MUTED}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}

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
              </section>

              <section id="education" className="order-3 scroll-mt-28">
                <Card className="p-6">
                  <div className="text-sm font-semibold text-slate-900">Education</div>
                  <p className="mt-2 text-sm text-slate-600">
                    School history, certifications, and training can live here as profile editing expands.
                  </p>

                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">
                      Standalone education editing is not connected yet.
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      For now, uploading your latest resume is the best way to keep
                      education and certifications attached to your profile during
                      generation and autofill workflows.
                    </p>
                    <button
                      type="button"
                      onClick={() => resumeInputRef.current?.click()}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      <ArrowUpTrayIcon className="h-4 w-4" />
                      Upload resume
                    </button>
                  </div>
                </Card>
              </section>

              <section id="ai-profile-sync" className="order-10 scroll-mt-28">
                <Card className="p-6">
                  <div className="text-sm font-semibold text-slate-900">AI Profile Sync</div>
                  <p className="mt-2 text-sm text-slate-600">
                    Keep your profile aligned with the workflows you already use in Hirexa.
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <FieldRow
                      label="Resume sync"
                      value={
                        profileStrength.hasResume
                          ? "Active from uploaded resume"
                          : "Waiting for a resume upload"
                      }
                    />
                    <FieldRow
                      label="Profile sync status"
                      value="Onboarding and profile saves sync automatically"
                    />
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Resume uploads, onboarding answers, and supported generate flows
                    already feed your saved Hirexa profile. Dedicated external-platform
                    sync controls can live here later without changing your current data.
                  </p>
                </Card>
              </section>
            </div>
          </section>
            </div>
          </div>
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

function isActiveBillingStatus(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["active", "trialing", "past_due", "unpaid"].includes(normalized);
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={["rounded-3xl border border-slate-200 bg-white shadow-sm", className].join(" ")}>
      {children}
    </div>
  );
}

function BillingStatusCard({
  title,
  subtitle,
  status,
  compact,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  status: "Active" | "Inactive";
  compact?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const active = status === "Active";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
        <span
          className={[
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
            active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600",
          ].join(" ")}
        >
          {status}
        </span>
      </div>

      {!compact && children ? <div className="mt-4">{children}</div> : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}

function SidebarSectionLink({
  href,
  label,
  active,
  onClick,
}: {
  href: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={(event) => {
        if (!onClick) return;
        event.preventDefault();
        onClick();
      }}
      aria-current={active ? "location" : undefined}
      className={[
        "inline-flex items-center rounded-full border px-3 py-2 text-sm font-semibold transition-colors lg:w-full lg:rounded-2xl",
        active
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
      ].join(" ")}
    >
      {label}
    </a>
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

function LocationAutocompleteField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(
    () =>
      value.trim()
        ? getLocationSuggestions(value).filter(
            (suggestion) => suggestion.label.toLowerCase() !== value.trim().toLowerCase()
          )
        : [],
    [value]
  );

  const handleSelect = (suggestion: LocationSuggestion) => {
    onChange(suggestion.label);
    setOpen(false);
  };

  return (
    <label className="relative flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        placeholder="Detroit, MI or Michigan"
        autoComplete="off"
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
      />

      {open && suggestions.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-lg">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(suggestion);
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <span>{suggestion.label}</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {suggestion.kind}
              </span>
            </button>
          ))}
        </div>
      ) : null}
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
