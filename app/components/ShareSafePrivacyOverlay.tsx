"use client";

import { Button } from "@/app/components/ui/button";
import {
  SHARE_SAFE_LIMITATION_COPY,
  SHARE_SAFE_SHORTCUT_LABEL,
} from "@/app/lib/shareSafe";

import { useShareSafe } from "./ShareSafeProvider";

export default function ShareSafePrivacyOverlay() {
  const { setShareSafeMode, shareSafeMode } = useShareSafe();

  if (!shareSafeMode) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/92 px-6 py-10 backdrop-blur-sm"
      data-testid="share-safe-overlay"
      role="dialog"
    >
      <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-slate-950/80 p-8 text-center shadow-[0_40px_120px_-50px_rgba(15,23,42,0.95)]">
        <div className="flex justify-center">
          <div className="inline-flex items-center rounded-full border border-sky-400/25 bg-slate-900/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
            Share-Safe Mode On
          </div>
        </div>

        <h2 className="mt-6 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          Hirexa AI is hidden while screen sharing
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-300 md:text-base">
          Sensitive jobs, resumes, candidate details, AI drafts, and profile
          data are hidden until you turn Share-Safe Mode off.
        </p>
        <p className="mx-auto mt-5 max-w-xl text-xs leading-5 text-slate-400">
          {SHARE_SAFE_LIMITATION_COPY}
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            className="rounded-full bg-sky-500 px-6 text-sm font-semibold text-white hover:bg-sky-400"
            onClick={() => setShareSafeMode(false)}
            type="button"
          >
            Show Hirexa again
          </Button>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300">
            Shortcut: {SHARE_SAFE_SHORTCUT_LABEL}
          </div>
        </div>
      </div>
    </div>
  );
}
