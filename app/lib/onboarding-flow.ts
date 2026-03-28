export const ONBOARDING_PROFILE_ROUTE = "/onboarding/profile";
export const QUESTIONS_CLIENTS_ROUTE = "/questionsClients";
export const QUESTIONS_LEGACY_ROUTE = "/questions";
export const RESUME_ROUTE = "/resume";
export const JOB_INTEREST_ROUTE = "/onboarding/job-interest";
export const TIME_SAVED_ROUTE = "/onboarding/time-saved";
export const MIN_SALARY_ROUTE = "/onboarding/min-salary";
export const SKILLS_ROUTE = "/onboarding/skills";
export const JOB_ALERTS_ROUTE = "/onboarding/job-alerts";
export const CHOOSE_WORKPLACE_ROUTE = "/onboarding/choose-workplace";
export const BENEFITS_ROUTE = "/benefits";
export const ACCOUNT_ROUTE = "/onboarding/account";
export const DASHBOARD_ROUTE = "/dashboard";

export const ONBOARDING_FLOW_ROUTES = [
  ONBOARDING_PROFILE_ROUTE,
  QUESTIONS_CLIENTS_ROUTE,
  RESUME_ROUTE,
  JOB_INTEREST_ROUTE,
  TIME_SAVED_ROUTE,
  MIN_SALARY_ROUTE,
  SKILLS_ROUTE,
  JOB_ALERTS_ROUTE,
  CHOOSE_WORKPLACE_ROUTE,
  BENEFITS_ROUTE,
  ACCOUNT_ROUTE,
] as const;

function normalizeRoute(path: string) {
  if (path === QUESTIONS_LEGACY_ROUTE) {
    return QUESTIONS_CLIENTS_ROUTE;
  }

  if (path.startsWith("/questions/step2Resume")) {
    return RESUME_ROUTE;
  }

  return path;
}

export function getNextOnboardingRoute(path: string) {
  const current = normalizeRoute(path);
  const currentIndex = ONBOARDING_FLOW_ROUTES.indexOf(
    current as (typeof ONBOARDING_FLOW_ROUTES)[number]
  );

  if (currentIndex < 0) return null;
  return ONBOARDING_FLOW_ROUTES[currentIndex + 1] ?? null;
}

export function getPreviousOnboardingRoute(path: string) {
  const current = normalizeRoute(path);
  const currentIndex = ONBOARDING_FLOW_ROUTES.indexOf(
    current as (typeof ONBOARDING_FLOW_ROUTES)[number]
  );

  if (currentIndex <= 0) return null;
  return ONBOARDING_FLOW_ROUTES[currentIndex - 1] ?? null;
}

export function isCurrentOnboardingRoute(path: string, route: string) {
  return normalizeRoute(path) === normalizeRoute(route);
}
