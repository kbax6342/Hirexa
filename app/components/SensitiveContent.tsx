"use client";

import type { ReactNode } from "react";

import {
  getSensitiveContentDisposition,
  type SensitiveContentMode,
} from "@/app/lib/shareSafe";
import { cn } from "@/app/lib/utils";

import { useShareSafe } from "./ShareSafeProvider";

type SensitiveContentProps = {
  children: ReactNode;
  className?: string;
  mode?: SensitiveContentMode;
  replacement?: ReactNode;
};

function ShareSafeReplacement() {
  return (
    <div
      className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-8 text-center text-slate-100 shadow-[0_30px_80px_-45px_rgba(15,23,42,0.95)]"
      data-testid="share-safe-sensitive-replacement"
    >
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200/85">
        Share-Safe Mode
      </div>
      <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
        Sensitive Hirexa AI content is hidden for screen sharing
      </h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        Turn Share-Safe Mode off when you are ready to return to your normal
        workspace.
      </p>
    </div>
  );
}

export default function SensitiveContent({
  children,
  className,
  mode = "replace",
  replacement,
}: SensitiveContentProps) {
  const { shareSafeMode } = useShareSafe();
  const disposition = getSensitiveContentDisposition(shareSafeMode, mode);

  if (disposition === "children") {
    return <>{children}</>;
  }

  if (disposition === "hide") {
    return replacement ? (
      <>{replacement}</>
    ) : (
      <div
        className={cn(
          "rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-center text-sm text-slate-200",
          className
        )}
        data-testid="share-safe-sensitive-hidden"
      >
        Hidden for screen sharing.
      </div>
    );
  }

  if (disposition === "blur") {
    return (
      <div
        className={cn("relative overflow-hidden rounded-[inherit]", className)}
        data-testid="share-safe-sensitive-blur"
      >
        <div className="pointer-events-none select-none blur-xl opacity-30">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 p-6 text-center">
          <div className="rounded-full border border-white/10 bg-slate-950/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
            Share-Safe Mode On
          </div>
        </div>
      </div>
    );
  }

  return <div className={className}>{replacement ?? <ShareSafeReplacement />}</div>;
}
