export const RECRUITER_STAGE_OPTIONS = [
  "SCREENED",
  "SUBMITTED",
  "INTERVIEW",
  "OFFER",
  "PLACED",
  "REJECTED",
] as const;

export type RecruiterStage = (typeof RECRUITER_STAGE_OPTIONS)[number];

export const RECRUITER_STAGE_LABELS: Record<RecruiterStage, string> = {
  SCREENED: "Screened",
  SUBMITTED: "Submitted",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  PLACED: "Placed",
  REJECTED: "Rejected",
};

export const RECRUITER_STAGE_BADGE_CLASSES: Record<RecruiterStage, string> = {
  SCREENED: "bg-slate-100 text-slate-700 ring-slate-200",
  SUBMITTED: "bg-sky-50 text-sky-700 ring-sky-200",
  INTERVIEW: "bg-amber-50 text-amber-700 ring-amber-200",
  OFFER: "bg-violet-50 text-violet-700 ring-violet-200",
  PLACED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function normalizeRecruiterStage(value: unknown): RecruiterStage {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase() as RecruiterStage;

  if (RECRUITER_STAGE_OPTIONS.includes(normalized)) {
    return normalized;
  }

  return "SCREENED";
}
