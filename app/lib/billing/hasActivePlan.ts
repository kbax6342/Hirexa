type PlanStatusProfile =
  | {
      trialSubscriber?: boolean | null;
      monthlySubscriber?: boolean | null;
      yearlySubscriber?: boolean | null;
      trialPlanStatus?: string | null;
      monthlyPlanStatus?: string | null;
      yearlyPlanStatus?: string | null;
    }
  | null
  | undefined;

const ACTIVE_PLAN_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "payment approved",
  "payed",
]);

export function isActivePlanStatus(value: string | null | undefined) {
  if (typeof value !== "string") return false;
  return ACTIVE_PLAN_STATUSES.has(value.trim().toLowerCase());
}

export function hasActivePlan(userProfile: PlanStatusProfile) {
  if (!userProfile) return false;

  return (
    userProfile.trialSubscriber === true ||
    userProfile.monthlySubscriber === true ||
    userProfile.yearlySubscriber === true ||
    isActivePlanStatus(userProfile.trialPlanStatus) ||
    isActivePlanStatus(userProfile.monthlyPlanStatus) ||
    isActivePlanStatus(userProfile.yearlyPlanStatus)
  );
}
