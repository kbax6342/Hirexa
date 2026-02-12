"use client";

import { useMemo, useState } from "react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";

type FormState = {
  firstName: string;
  lastName: string;
  dob: string; // MM/DD/YYYY
  address: string;
  city: string;
  postalCode: string;
  state: string;
  linkedinUrl: string;
  phone: string;
  email: string;
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

export default function ProfileForm() {
    const [form, setForm] = useState<FormState>({
        firstName: "",
        lastName: "",
        dob: "",
        address: "",
        city: "",
        postalCode: "",
        state: "",
        linkedinUrl: "",
        phone: "",
        email: "",
      });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (!requiredOk) {
      setError("Please fill in First name, Last name, and Email.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save profile.");

      setSaved(true);
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const inputBase =
    "h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 " +
    "shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15";

  const labelBase = "text-xs font-semibold text-slate-700";
  const requiredStar = <span className="text-rose-500">*</span>;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Row 1 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelBase}>
            First name {requiredStar}
          </label>
          <div className="relative mt-1">
            <input
              className={inputBase + " pr-10"}
              value={form.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              placeholder="First name"
              autoComplete="given-name"
            />
            {form.firstName.trim() ? (
              <CheckCircleIcon className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-500" />
            ) : null}
          </div>
        </div>

        <div>
          <label className={labelBase}>
            Last name {requiredStar}
          </label>
          <div className="relative mt-1">
            <input
              className={inputBase + " pr-10"}
              value={form.lastName}
              onChange={(e) => update("lastName", e.target.value)}
              placeholder="Last name"
              autoComplete="family-name"
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
            >
              <option value="">Select…</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Row 4 */}
      <div>
        <label className={labelBase}>LinkedIn profile</label>
        <div className="mt-1">
          <input
            className={inputBase}
            value={form.linkedinUrl}
            onChange={(e) => update("linkedinUrl", e.target.value)}
            placeholder="e.g. www.linkedin.com/in/"
          />
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
              onChange={(e) => update("phone", e.target.value)}
              placeholder="(###) ###-####"
              autoComplete="tel"
            />
            {form.phone.trim() ? (
              <CheckCircleIcon className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-500" />
            ) : null}
          </div>
        </div>

        <div>
          <label className={labelBase}>
            Email address {requiredStar}
          </label>
          <div className="relative mt-1">
            <input
              className={inputBase + " pr-10"}
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
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
          disabled={saving}
          className="inline-flex h-11 items-center justify-center rounded-md bg-sky-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </form>
  );
}
