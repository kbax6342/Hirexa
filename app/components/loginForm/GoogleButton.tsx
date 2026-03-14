"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function GoogleButton() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/resume";

  return (
    <button
      type="button"
      onClick={() => signIn("google", { callbackUrl })}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
    >
      <span className="text-base">G</span>
      <span>Continue with Google</span>
    </button>
  );
}
