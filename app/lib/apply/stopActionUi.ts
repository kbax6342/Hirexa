"use client";

import {
  getStopSuggestedActionLabel,
  type ApplyStopSuggestedAction,
} from "@/app/lib/apply/stopClassification";

export type StopSuggestedActionUi = {
  label: string;
  recommendationText: string;
};

export function getStopSuggestedActionUi(
  suggestedAction: ApplyStopSuggestedAction,
): StopSuggestedActionUi {
  switch (suggestedAction) {
    case "open_original_job_site":
      return {
        label: getStopSuggestedActionLabel(suggestedAction),
        recommendationText:
          "This looks like a job-board listing rather than the employer's actual application page. Open the original job site to continue or teach Hirexa how to reach it.",
      };
    case "sign_in_and_retry":
      return {
        label: getStopSuggestedActionLabel(suggestedAction),
        recommendationText:
          "This page appears to require sign-in before continuing. Sign in first, then retry or teach Hirexa the post-login flow.",
      };
    case "complete_verification":
      return {
        label: getStopSuggestedActionLabel(suggestedAction),
        recommendationText:
          "Employer verification is required before Hirexa can continue. Complete the verification, then resume the application.",
      };
    case "teach_this_page":
      return {
        label: getStopSuggestedActionLabel(suggestedAction),
        recommendationText:
          "Hirexa could not confidently continue on this page. Teach this page to record the correct flow for this site.",
      };
    case "review_and_retry":
    default:
      return {
        label: getStopSuggestedActionLabel(suggestedAction),
        recommendationText:
          "Review the previous attempt details first, then use Retry with Fresh Session or Teach this page.",
      };
  }
}
