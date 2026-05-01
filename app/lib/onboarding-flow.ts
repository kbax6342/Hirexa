export const ONBOARDING_PROFILE_ROUTE = "/onboarding/profile";
export const QUESTIONS_CLIENTS_ROUTE = "/questionsClients";
export const QUESTIONS_LEGACY_ROUTE = "/questions";
export const RESUME_ROUTE = "/resume";
export const JOB_INTEREST_ROUTE = "/onboarding/job-interest";
export const JOB_GOAL_ROUTE = "/onboarding/job-goal";
export const JOB_PRIORITIES_ROUTE = "/onboarding/job-priorities";
export const RESUME_IMPORT_ROUTE = "/onboarding/resume-import";
export const WORK_STORY_ROUTE = "/onboarding/work-story";
export const JOB_LOCATION_ROUTE = "/onboarding/job-location";
export const HIGHLIGHT_SKILLS_ROUTE = "/onboarding/highlight-skills";
export const JOB_FILTERS_ROUTE = "/onboarding/job-filters";
export const HIREXA_SUPPORT_ROUTE = "/onboarding/hirexa-support";
export const HIREXA_SUPPORT_EXTRAS_ROUTE = "/onboarding/hirexa-support-extras";
export const HIRING_SIGNAL_ROUTE = "/onboarding/hiring-signal";
export const CREATE_ACCOUNT_ROUTE = "/onboarding/create-account";
export const VERIFY_ACCOUNT_ROUTE = "/onboarding/verify-account";
export const ONBOARDING_CONFIRMATION_ROUTE = "/onboarding/confirm";
export const TIME_SAVED_ROUTE = "/onboarding/time-saved";
export const MIN_SALARY_ROUTE = "/onboarding/min-salary";
export const SKILLS_ROUTE = "/onboarding/skills";
export const JOB_ALERTS_ROUTE = "/onboarding/job-alerts";
export const CHOOSE_WORKPLACE_ROUTE = "/onboarding/choose-workplace";
export const BENEFITS_ROUTE = "/benefits";
export const ACCOUNT_ROUTE = "/onboarding/account";
export const DASHBOARD_ROUTE = "/dashboard";

export const PRIMARY_ONBOARDING_FLOW_ROUTES = [
  JOB_INTEREST_ROUTE,
  JOB_GOAL_ROUTE,
  JOB_PRIORITIES_ROUTE,
  RESUME_IMPORT_ROUTE,
  WORK_STORY_ROUTE,
  JOB_LOCATION_ROUTE,
  HIRING_SIGNAL_ROUTE,
] as const;

export const ONBOARDING_FLOW_ROUTES = [
  ONBOARDING_PROFILE_ROUTE,
  QUESTIONS_CLIENTS_ROUTE,
  RESUME_ROUTE,
  JOB_INTEREST_ROUTE,
  JOB_GOAL_ROUTE,
  JOB_PRIORITIES_ROUTE,
  RESUME_IMPORT_ROUTE,
  WORK_STORY_ROUTE,
  HIGHLIGHT_SKILLS_ROUTE,
  JOB_FILTERS_ROUTE,
  HIREXA_SUPPORT_ROUTE,
  HIREXA_SUPPORT_EXTRAS_ROUTE,
  HIRING_SIGNAL_ROUTE,
  TIME_SAVED_ROUTE,
  MIN_SALARY_ROUTE,
  SKILLS_ROUTE,
  JOB_ALERTS_ROUTE,
  CHOOSE_WORKPLACE_ROUTE,
  BENEFITS_ROUTE,
  ONBOARDING_CONFIRMATION_ROUTE,
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

function getFlowRouteIndex(flow: readonly string[], path: string) {
  const current = normalizeRoute(path);

  return flow.indexOf(current);
}

export function getNextOnboardingRoute(path: string) {
  const currentIndex = getFlowRouteIndex(ONBOARDING_FLOW_ROUTES, path);

  if (currentIndex < 0) return null;
  return ONBOARDING_FLOW_ROUTES[currentIndex + 1] ?? null;
}

export function getPreviousOnboardingRoute(path: string) {
  const currentIndex = getFlowRouteIndex(ONBOARDING_FLOW_ROUTES, path);

  if (currentIndex <= 0) return null;
  return ONBOARDING_FLOW_ROUTES[currentIndex - 1] ?? null;
}

export function getNextPrimaryOnboardingRoute(path: string) {
  const currentIndex = getFlowRouteIndex(PRIMARY_ONBOARDING_FLOW_ROUTES, path);

  if (currentIndex < 0) return null;
  return PRIMARY_ONBOARDING_FLOW_ROUTES[currentIndex + 1] ?? null;
}

export function getPreviousPrimaryOnboardingRoute(path: string) {
  const currentIndex = getFlowRouteIndex(PRIMARY_ONBOARDING_FLOW_ROUTES, path);

  if (currentIndex <= 0) return null;
  return PRIMARY_ONBOARDING_FLOW_ROUTES[currentIndex - 1] ?? null;
}

export function isCurrentOnboardingRoute(path: string, route: string) {
  return normalizeRoute(path) === normalizeRoute(route);
}
