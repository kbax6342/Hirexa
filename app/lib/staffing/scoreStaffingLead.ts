import type {
  StaffingLeadCompanyContext,
  StaffingLeadDraft,
  StaffingLeadScoreResult,
  StaffingLeadSummary,
  StaffingLeadTier,
} from "@/app/types/staffing-screening";

const FLEXIBLE_SHIFT_SIGNALS = new Set(["Flexible", "Weekends", "Overtime"]);
const EXPERIENCE_NONE = "None Yet";

export function getStaffingLeadTier(score: number): StaffingLeadTier {
  if (score >= 80) {
    return "Hot Lead";
  }

  if (score >= 60) {
    return "Good Lead";
  }

  if (score >= 40) {
    return "Needs Review";
  }

  return "Low Fit";
}

export function getStaffingRecommendedAction(tier: StaffingLeadTier) {
  switch (tier) {
    case "Hot Lead":
      return "Call or text today.";
    case "Good Lead":
      return "Add to recruiter queue.";
    case "Needs Review":
      return "Ask follow-up questions.";
    case "Low Fit":
    default:
      return "Send application link or job alerts.";
  }
}

export function scoreStaffingLead(
  lead: StaffingLeadDraft
): StaffingLeadScoreResult {
  let score = 0;

  if (lead.candidateName?.trim() && lead.phone?.trim() && lead.email?.trim()) {
    score += 20;
  }

  if (lead.startAvailability === "Today" || lead.startAvailability === "This Week") {
    score += 15;
  }

  if (lead.transportationStatus === "Yes") {
    score += 15;
  }

  if ((lead.experience ?? []).some((entry) => entry !== EXPERIENCE_NONE)) {
    score += 20;
  }

  if (
    (lead.shiftAvailability ?? []).length > 1 ||
    (lead.shiftAvailability ?? []).some((entry) => FLEXIBLE_SHIFT_SIGNALS.has(entry))
  ) {
    score += 15;
  }

  if (
    lead.desiredJobType === "Temp-to-Hire" ||
    lead.desiredJobType === "Full-Time" ||
    lead.desiredJobType === "Direct Hire"
  ) {
    score += 10;
  }

  if (lead.consentToContact) {
    score += 5;
  }

  const boundedScore = Math.max(0, Math.min(score, 100));
  const tier = getStaffingLeadTier(boundedScore);

  return {
    score: boundedScore,
    tier,
    recommendedAction: getStaffingRecommendedAction(tier),
  };
}

export function buildStaffingLeadSummary(
  lead: StaffingLeadDraft,
  companyContext?: StaffingLeadCompanyContext
): StaffingLeadSummary {
  return {
    ...(companyContext ?? {}),
    ...lead,
    ...scoreStaffingLead(lead),
  };
}
