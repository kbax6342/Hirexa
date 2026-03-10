type PlanStatusProfile =
  | {
      trialPlanStatus?: string | null;
      monthlyPlanStatus?: string | null;
      yearlyPlanStatus?: string | null;
    }
  | null
  | undefined;

export function hasActivePlan(userProfile: PlanStatusProfile) {
  if (!userProfile) return false;

  return (
    userProfile.trialPlanStatus === "active" ||
    userProfile.monthlyPlanStatus === "active" ||
    userProfile.yearlyPlanStatus === "active"
  );
}
