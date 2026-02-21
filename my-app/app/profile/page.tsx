"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowUpTrayIcon,
  PencilSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

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

const NON_DB_TEXT_CLASS = "text-slate-600";

type ProfessionalDetailsForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  linkedinUrl: string;
  portfolioUrl: string;
};

export default function ProfilePage() {
  const [expandedExp, setExpandedExp] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileApiResponse["profile"]>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeUploadError, setResumeUploadError] = useState<string | null>(null);
  const [resumeUploadSuccess, setResumeUploadSuccess] = useState<string | null>(null);
  const [savingProfessionalDetails, setSavingProfessionalDetails] = useState(false);
  const [professionalDetailsError, setProfessionalDetailsError] = useState<string | null>(null);
  const [professionalDetailsSuccess, setProfessionalDetailsSuccess] = useState<string | null>(null);
  const [professionalDetailsForm, setProfessionalDetailsForm] = useState<ProfessionalDetailsForm>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    linkedinUrl: "",
    portfolioUrl: "",
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
    const keyQuestions =
      profile?.keyQuestions && typeof profile.keyQuestions === "object" && !Array.isArray(profile.keyQuestions)
        ? (profile.keyQuestions as Record<string, unknown>)
        : {};

    setProfessionalDetailsForm({
      firstName: profile?.firstName ?? "",
      lastName: profile?.lastName ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      address: profile?.address ?? "",
      linkedinUrl: profile?.linkedinUrl ?? "",
      portfolioUrl: String(keyQuestions.portfolioUrl ?? ""),
    });
  }, [profile]);

  const avatarInitial = (professionalDetailsForm.firstName || professionalDetailsForm.lastName || "?")
    .trim()
    .slice(0, 1)
    .toUpperCase();

  const experience = (profile?.resume?.experiences ?? []).map((exp) => ({
    id: exp.id,
    title: exp.title,
    company: exp.company,
    location: exp.location ?? "Location not provided",
    dateRange: exp.dateRange ?? "Date range not provided",
    bullets: exp.bullets.map((item) => item.text),
  }));
  const recentExperience = experience.slice(0, 4);

  async function saveProfessionalDetails() {
    try {
      setSavingProfessionalDetails(true);
      setProfessionalDetailsError(null);
      setProfessionalDetailsSuccess(null);

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: professionalDetailsForm.firstName,
          lastName: professionalDetailsForm.lastName,
          email: professionalDetailsForm.email,
          phone: professionalDetailsForm.phone,
          address: professionalDetailsForm.address,
          linkedinUrl: professionalDetailsForm.linkedinUrl,
          portfolioUrl: professionalDetailsForm.portfolioUrl,
        }),
      });

      const data = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to save professional details.");
      }

      setProfessionalDetailsSuccess("Professional details updated.");
      await loadProfile();
    } catch (e) {
      setProfessionalDetailsError(e instanceof Error ? e.message : "Failed to save professional details.");
    } finally {
      setSavingProfessionalDetails(false);
    }
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
          <section className="lg:col-span-5">
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="text-black text-md mb-2">Professional Details:</div>
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
                        {avatarInitial}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1" />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
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
                <InputField
                  label="First Name"
                  value={professionalDetailsForm.firstName}
                  onChange={(value) => setProfessionalDetailsForm((prev) => ({ ...prev, firstName: value }))}
                />
                <InputField
                  label="Last Name"
                  value={professionalDetailsForm.lastName}
                  onChange={(value) => setProfessionalDetailsForm((prev) => ({ ...prev, lastName: value }))}
                />
                <InputField
                  label="Email"
                  value={professionalDetailsForm.email}
                  onChange={(value) => setProfessionalDetailsForm((prev) => ({ ...prev, email: value }))}
                />
                <InputField
                  label="Phone"
                  value={professionalDetailsForm.phone}
                  onChange={(value) => setProfessionalDetailsForm((prev) => ({ ...prev, phone: value }))}
                />
                <InputField
                  label="Address"
                  value={professionalDetailsForm.address}
                  onChange={(value) => setProfessionalDetailsForm((prev) => ({ ...prev, address: value }))}
                />
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-xs font-semibold text-slate-700">Links</div>
                  <div className="mt-3 space-y-3">
                    <InputField
                      label="LinkedIn"
                      value={professionalDetailsForm.linkedinUrl}
                      onChange={(value) => setProfessionalDetailsForm((prev) => ({ ...prev, linkedinUrl: value }))}
                    />
                    <InputField
                      label="Portfolio"
                      value={professionalDetailsForm.portfolioUrl}
                      onChange={(value) => setProfessionalDetailsForm((prev) => ({ ...prev, portfolioUrl: value }))}
                    />
                  </div>
                </div>
              </div>

              {loading ? <p className="mt-4 text-sm text-slate-600">Loading profile…</p> : null}
              {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
              {professionalDetailsError ? <p className="mt-4 text-sm text-red-600">{professionalDetailsError}</p> : null}
              {professionalDetailsSuccess ? <p className="mt-4 text-sm text-emerald-700">{professionalDetailsSuccess}</p> : null}

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => void saveProfessionalDetails()}
                  disabled={savingProfessionalDetails}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingProfessionalDetails ? "Saving..." : "Save changes"}
                </button>
              </div>
            </Card>

          </section>

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
                      <div className="text-md font-semibold text-slate-700">Experience: </div>

                      <button
                        type="button"
                        className={`rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold hover:bg-slate-200 ${NON_DB_TEXT_CLASS}`}
                      >
                        + Add experience
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {experience.length > 4 ? (
                        <p className={`text-xs ${NON_DB_TEXT_CLASS}`}>Showing the 4 most recent experience records.</p>
                      ) : null}

                      {recentExperience.length === 0 ? (
                        <p className={`text-sm ${NON_DB_TEXT_CLASS}`}>No experience rows found in database.</p>
                      ) : null}

                      {recentExperience.map((exp) => {
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

function InputField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
      />
    </label>
  );
}

