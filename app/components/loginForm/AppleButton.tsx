"use client";

import { signIn } from "next-auth/react";

import { DASHBOARD_ROUTE } from "@/app/lib/onboarding-flow";
import { cn } from "@/app/lib/utils";

type AppleButtonProps = {
  callbackUrl?: string;
  className?: string;
  disabled?: boolean;
  onBeforeSignIn?: () => void | Promise<void>;
};

export default function AppleButton({
  callbackUrl = DASHBOARD_ROUTE,
  className,
  disabled = false,
  onBeforeSignIn,
}: AppleButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={async () => {
        if (onBeforeSignIn) {
          await onBeforeSignIn();
        }

        await signIn("apple", { callbackUrl });
      }}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:bg-slate-50",
        className
      )}
    >
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="h-[18px] w-[18px] shrink-0 fill-current"
      >
        <path d="M13.4 3.1c.7-.9 1.2-2.1 1.1-3.1-1.1.1-2.4.7-3.2 1.6-.7.8-1.3 2-1.1 3.1 1.2.1 2.4-.6 3.2-1.6Zm1.2 6.4c0-2 1.6-3 1.7-3.1-.9-1.4-2.3-1.6-2.8-1.6-1.2-.1-2.3.7-2.9.7-.6 0-1.5-.7-2.4-.7-1.2 0-2.4.7-3.1 1.9-1.3 2.3-.4 5.6.9 7.5.7 1 1.5 2 2.5 2 .8 0 1.1-.5 2.1-.5s1.3.5 2.2.5c.9 0 1.5-.9 2.1-1.9.7-1.1 1-2.3 1-2.4 0 0-2-.8-2-3.1Z" />
      </svg>
      <span>Continue with Apple</span>
    </button>
  );
}
