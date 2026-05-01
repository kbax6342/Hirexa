"use client";

import { EyeSlashIcon } from "@heroicons/react/24/outline";

import { cn } from "@/app/lib/utils";

type ShareSafeBadgeProps = {
  className?: string;
  floating?: boolean;
};

export default function ShareSafeBadge({
  className,
  floating = false,
}: ShareSafeBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-slate-950/85 px-3 py-1.5 text-xs font-semibold tracking-[0.18em] text-sky-100 shadow-lg backdrop-blur",
        floating && "fixed right-4 top-24 z-[130]",
        className
      )}
      data-testid="share-safe-badge"
      role="status"
    >
      <EyeSlashIcon className="h-4 w-4" />
      <span>Share-Safe Mode On</span>
    </div>
  );
}
