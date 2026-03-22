"use client";

import { signIn } from "next-auth/react";

const GOOGLE_CALLBACK_URL = "/auth/google/redirect";

export default function GoogleButton() {
  return (
    <button
      type="button"
      onClick={() => signIn("google", { callbackUrl: GOOGLE_CALLBACK_URL })}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
    >
      <span className="text-base">G</span>
      <span>Continue with Google</span>
    </button>
  );
}
