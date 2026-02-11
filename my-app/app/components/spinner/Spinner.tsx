"use client";

type Props = {
  label?: string;
  sublabel?: string;
};

export default function AdzunaSpinner({
  label = "Loading jobs…",
  sublabel = "Pulling fresh listings from Adzuna",
}: Props) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-10 backdrop-blur-xl">
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200/40" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
        </div>

        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        <div className="text-xs text-muted-foreground/70">{sublabel}</div>
      </div>
    </div>
  );
}
