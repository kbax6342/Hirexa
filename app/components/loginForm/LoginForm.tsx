"use client";

import { useState } from "react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

import { Button } from "../ui/button";

type Props = {
  isSigningIn: boolean;
  signInError?: string | null;
};

export default function LoginForm({ isSigningIn, signInError }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  function calculateStrength(password: string) {
    let score = 0;

    if (password.length > 6) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    return score;
  }

  return (
    <div className="space-y-4">
      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 text-black h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none ring-sky-500/20 focus:border-sky-400 focus:ring-4"
        />
      </div>

      {/* Password */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">
          Password
        </label>

        <div className="relative">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            onChange={(event) => {
              const value = event.target.value;
              setPasswordStrength(calculateStrength(value));
            }}
            onKeyUp={(event) => {
              setCapsLockOn(event.getModifierState("CapsLock"));
            }}
            onBlur={() => setCapsLockOn(false)}
            className="text-black h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-11 text-sm outline-none ring-sky-500/20 focus:border-sky-400 focus:ring-4"
          />

          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-700"
            aria-label="Toggle password visibility"
          >
            {showPassword ? (
              <EyeSlashIcon className="h-5 w-5" />
            ) : (
              <EyeIcon className="h-5 w-5" />
            )}
          </button>
        </div>

        {capsLockOn ? (
          <p className="text-xs text-yellow-600">Caps Lock is on</p>
        ) : null}

        <div className="h-2 overflow-hidden rounded bg-gray-200">
          <div
            className={`h-full transition-all ${
              passwordStrength === 0
                ? "w-0"
                : passwordStrength === 1
                ? "w-1/4 bg-red-500"
                : passwordStrength === 2
                ? "w-2/4 bg-yellow-500"
                : passwordStrength === 3
                ? "w-3/4 bg-blue-500"
                : "w-full bg-green-500"
            }`}
          />
        </div>
      </div>

      {signInError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {signInError}
        </div>
      ) : null}

      {/* Sign in button */}
      <Button
        type="submit"
        size="lg"
        disabled={isSigningIn}
        className="h-12 w-full bg-slate-900 text-white hover:bg-slate-800"
      >
        {isSigningIn ? "Signing in…" : "Sign in"}
      </Button>
    </div>
  );
}
