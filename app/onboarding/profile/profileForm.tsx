"use client";

import React, { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";
import {
  ONBOARDING_PROFILE_ROUTE,
  RESUME_ROUTE,
} from "@/app/lib/onboarding-flow";

type FormState = {
  firstName: string;
  lastName: string;
  dob: string; // MM/DD/YYYY
  address: string;
  city: string;
  postalCode: string;
  state: string;
  linkedinUrl: string;
  portfolioUrl: string;
  phone: string;
  email: string;
};

type DraftResponse = {
  draft?: {
    payload?: {
      profile?: Partial<FormState>;
    } | null;
  } | null;
  error?: string;
};

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana",
  "Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana",
  "Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina",
  "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
  "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming",
];

function formatDobForInput(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoMatch) {
    return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  }

  return raw;
}

function formatPhoneNumber(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 10);

  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function ProfileForm() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>({
    firstName: "",
    lastName: "",
    dob: "",
    address: "",
    city: "",
    postalCode: "",
    state: "",
    linkedinUrl: "",
    portfolioUrl: "",
    phone: "",
    email: "",
  });

  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileDraft() {
      try {
        setLoadingProfile(true);

        const startRes = await fetch("/api/onboarding/start", {
          method: "POST",
          cache: "no-store",
          credentials: "include",
        });

        if (!startRes.ok) {
          throw new Error("Failed to start onboarding.");
        }

        const res = await fetch("/api/onboarding/draft", {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await res.json()) as DraftResponse;

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load onboarding draft.");
        }

        const profile = data?.draft?.payload?.profile;
        if (!profile || cancelled) return;

        setForm((prev) => ({
          ...prev,
          firstName: profile.firstName ?? prev.firstName,
          lastName: profile.lastName ?? prev.lastName,
          dob: profile.dob ? formatDobForInput(profile.dob) : prev.dob,
          address: profile.address ?? prev.address,
          city: profile.city ?? prev.city,
          postalCode: profile.postalCode ?? prev.postalCode,
          state: profile.state ?? prev.state,
          linkedinUrl: profile.linkedinUrl ?? prev.linkedinUrl,
          portfolioUrl: profile.portfolioUrl ?? prev.portfolioUrl,
          phone: formatPhoneNumber(profile.phone) || prev.phone,
          email: profile.email ?? prev.email,
        }));
      } catch (e: unknown) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : "Failed to load existing profile.";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
          setDraftHydrated(true);
        }
      }
    }

    void loadProfileDraft();

    return () => {
      cancelled = true;
    };
  }, []);

  const requiredOk = useMemo(() => {
    return (
      form.firstName.trim().length > 0 &&
      form.lastName.trim().length > 0 &&
      form.email.trim().length > 0
    );
  }, [form.firstName, form.lastName, form.email]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setSaved(false);
    setError(null);
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function saveProfile(options?: { requireRequiredFields?: boolean }) {
    if (options?.requireRequiredFields && !requiredOk) {
      return {
        ok: false as const,
        message: "Please fill in First name, Last name, and Email.",
      };
    }

    try {
      const res = await fetch("/api/onboarding/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lastStep: ONBOARDING_PROFILE_ROUTE,
          payload: {
            profile: form,
          },
        }),
      });

      let data: { error?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        return {
          ok: false as const,
          message: data?.error || "Failed to save profile.",
        };
      }

      return { ok: true as const };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Network error. Please try again.";
      return { ok: false as const, message };
    }
  }

  const autosaveProfileDraft = useEffectEvent(async () => {
    const result = await saveProfile();
    if (result.ok) {
      setSaved(true);
      return;
    }

    setError(result.message);
  });

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void autosaveProfileDraft();
    }, 450);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [draftHydrated, form]);

  // This replaces formAction. It's client-safe and handles errors.
  async function handleNext(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;

    setError(null);
    setSaved(false);
    setSaving(true);

    const result = await saveProfile({ requireRequiredFields: true });

    if (!result.ok) {
      setError(result.message);
      setSaving(false);
      return;
    }

    setSaved(true);
    setSaving(false);

    // ✅ Only navigate when save succeeds
    router.push(RESUME_ROUTE);
  }

  const inputBase =
    "h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 " +
    "shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15";

  const labelBase = "text-xs font-semibold text-slate-700";
  const requiredStar = <span className="text-rose-500">*</span>;

  return (
    <form onSubmit={handleNext} className="space-y-5">
      {/* Row 1 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelBase}>First name {requiredStar}</label>
          <div className="relative mt-1">
            <input
              className={inputBase + " pr-10"}
              value={form.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              placeholder="First name"
              autoComplete="given-name"
              data-testid="profile-first-name"
            />
            {form.firstName.trim() ? (
              <CheckCircleIcon className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-500" />
            ) : null}
          </div>
        </div>

        <div>
          <label className={labelBase}>Last name {requiredStar}</label>
          <div className="relative mt-1">
            <input
              className={inputBase + " pr-10"}
              value={form.lastName}
              onChange={(e) => update("lastName", e.target.value)}
              placeholder="Last name"
              autoComplete="family-name"
              data-testid="profile-last-name"
            />
            {form.lastName.trim() ? (
              <CheckCircleIcon className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-500" />
            ) : null}
          </div>
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelBase}>Date of Birth</label>
          <div className="mt-1">
            <input
              className={inputBase}
              value={form.dob}
              onChange={(e) => update("dob", e.target.value)}
              placeholder="MM/DD/YYYY"
              inputMode="numeric"
            />
          </div>
        </div>

        <div>
          <label className={labelBase}>Address</label>
          <div className="mt-1">
            <input
              className={inputBase}
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="e.g. 123 Main St,"
              autoComplete="street-address"
              data-testid="profile-address"
            />
          </div>
        </div>
      </div>

      {/* Row 3 */}
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className={labelBase}>City</label>
          <div className="relative mt-1">
            <input
              className={inputBase + " pr-10"}
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="City"
              autoComplete="address-level2"
              data-testid="profile-city"
            />
            {form.city.trim() ? (
              <CheckCircleIcon className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-500" />
            ) : null}
          </div>
        </div>

        <div>
          <label className={labelBase}>Postal code</label>
          <div className="relative mt-1">
            <input
              className={inputBase + " pr-10"}
              value={form.postalCode}
              onChange={(e) => update("postalCode", e.target.value)}
              placeholder="Zip"
              autoComplete="postal-code"
              data-testid="profile-postal-code"
            />
            {form.postalCode.trim() ? (
              <CheckCircleIcon className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-500" />
            ) : null}
          </div>
        </div>

        <div>
          <label className={labelBase}>State</label>
          <div className="relative mt-1">
            <select
              className={inputBase}
              value={form.state}
              onChange={(e) => update("state", e.target.value)}
              autoComplete="address-level1"
              data-testid="profile-state"
            >
              <option value="">Select…</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Row 4 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelBase}>LinkedIn profile</label>
          <div className="mt-1">
            <input
              className={inputBase}
              value={form.linkedinUrl}
              onChange={(e) => update("linkedinUrl", e.target.value)}
              placeholder="e.g. www.linkedin.com/in/"
              data-testid="profile-linkedin"
            />
          </div>
        </div>

        <div>
          <label className={labelBase}>Portfolio link</label>
          <div className="mt-1">
            <input
              className={inputBase}
              value={form.portfolioUrl}
              onChange={(e) => update("portfolioUrl", e.target.value)}
              placeholder="e.g. https://yourportfolio.com"
            />
          </div>
        </div>
      </div>

      {/* Row 5 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelBase}>Phone number</label>
          <div className="relative mt-1">
            <input
              className={inputBase + " pr-10"}
              value={form.phone}
              onChange={(e) => update("phone", formatPhoneNumber(e.target.value))}
              placeholder="(###) ###-####"
              autoComplete="tel"
              data-testid="profile-phone"
            />
            {form.phone.trim() ? (
              <CheckCircleIcon className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-500" />
            ) : null}
          </div>
        </div>

        <div>
          <label className={labelBase}>Email address {requiredStar}</label>
          <div className="relative mt-1">
            <input
              className={inputBase + " pr-10"}
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              data-testid="profile-email"
            />
            {form.email.trim() ? (
              <CheckCircleIcon className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-500" />
            ) : null}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-none" />
          <div>{error}</div>
        </div>
      ) : null}

      {saved ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-none" />
          <div>Saved!</div>
        </div>
      ) : null}

      {/* Submit */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={saving === true || loadingProfile}
          data-testid="profile-continue"
          className={[
            "inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-semibold text-white shadow-sm transition",
            saving || loadingProfile
              ? "bg-sky-400 cursor-not-allowed opacity-60"
              : "bg-sky-600 hover:bg-sky-700 cursor-pointer",
          ].join(" ")}
        >
          {loadingProfile ? "Loading..." : saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </form>
  );
}
