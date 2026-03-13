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

export function hasActivePlan(userProfile: PlanStatusProfile) {
  if (!userProfile) return false;

  return (
    userProfile.trialSubscriber === true ||
    userProfile.monthlySubscriber === true ||
    userProfile.yearlySubscriber === true ||
    userProfile.trialPlanStatus === "active" ||
    userProfile.monthlyPlanStatus === "active" ||
    userProfile.yearlyPlanStatus === "active"
  );
}
