"use client";

import React from "react";
import { Button } from "../ui/button";

type Props = {
  isSigningIn: boolean;
  signInError?: string | null;
};

export default function LoginForm({ isSigningIn, signInError }: Props) {
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
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 text-black h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none ring-sky-500/20 focus:border-sky-400 focus:ring-4"
        />
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
