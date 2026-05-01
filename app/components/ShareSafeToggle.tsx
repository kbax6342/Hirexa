"use client";

import {
  EyeSlashIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { Switch } from "@/app/components/ui/switch";
import {
  SHARE_SAFE_LIMITATION_COPY,
  SHARE_SAFE_SHORTCUT_LABEL,
} from "@/app/lib/shareSafe";
import { cn } from "@/app/lib/utils";

import { useShareSafe } from "./ShareSafeProvider";

type ShareSafeToggleProps = {
  className?: string;
  fullWidth?: boolean;
};

export default function ShareSafeToggle({
  className,
  fullWidth = false,
}: ShareSafeToggleProps) {
  const {
    desktopBridgeAvailable,
    minimizeWhenHiding,
    setMinimizeWhenHiding,
    shareSafeMode,
    toggleShareSafeMode,
  } = useShareSafe();

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        fullWidth && "w-full justify-between",
        className
      )}
    >
      <Button
        aria-label="Hide for screen share"
        aria-pressed={shareSafeMode}
        className={cn(
          "rounded-full border border-white/12 bg-white/[0.05] px-4 text-sm font-semibold text-white hover:bg-white/[0.1]",
          shareSafeMode &&
            "border-sky-300/30 bg-sky-500/90 text-white hover:bg-sky-400/90",
          fullWidth && "justify-start"
        )}
        data-testid="share-safe-toggle"
        onClick={toggleShareSafeMode}
        title={`Shortcut: ${SHARE_SAFE_SHORTCUT_LABEL}`}
        type="button"
        variant="ghost"
      >
        <EyeSlashIcon className="h-4 w-4" />
        <span>Hide for screen share</span>
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <button
            aria-label="Share-Safe settings"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white transition hover:bg-white/[0.08]"
            type="button"
          >
            <InformationCircleIcon className="h-5 w-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[min(24rem,calc(100vw-2rem))] rounded-3xl border-white/10 bg-[#111827] p-5 text-slate-100"
        >
          <div className="text-sm font-semibold text-white">Share-Safe Mode</div>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Hide sensitive Hirexa AI content quickly while you share your screen.
          </p>
          <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300">
            Shortcut: {SHARE_SAFE_SHORTCUT_LABEL}
          </div>

          <div className="mt-4 flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.04] p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">
                Minimize app when hiding
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Available in the downloaded desktop app when the secure bridge is
                installed.
              </p>
            </div>
            <Switch
              checked={minimizeWhenHiding}
              disabled={!desktopBridgeAvailable}
              onCheckedChange={setMinimizeWhenHiding}
            />
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-400">
            {SHARE_SAFE_LIMITATION_COPY}
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
