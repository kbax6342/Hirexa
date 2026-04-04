export const ALL_JOB_GOAL_OPTIONS = [
  "Get hired as fast as possible",
  "Find a better-paying job",
  "Find steady long-term work",
  "Grow into a higher-skill role",
  "Find remote work",
  "Find a closer commute",
  "Get more flexibility",
  "Switch careers",
] as const;

const DEFAULT_JOB_GOAL_OPTIONS = [
  "Get hired as fast as possible",
  "Find a better-paying job",
  "Grow into a higher-skill role",
  "Switch careers",
] as const;

const ROLE_GOAL_RULES = [
  {
    keywords: [
      "software engineer",
      "software developer",
      "developer",
      "engineer",
      "frontend",
      "backend",
      "full stack",
      "programmer",
      "qa",
      "devops",
      "data analyst",
      "analyst",
      "designer",
    ],
    options: [
      "Find a better-paying job",
      "Find remote work",
      "Grow into a higher-skill role",
      "Get more flexibility",
    ],
  },
  {
    keywords: [
      "customer support",
      "customer service",
      "support specialist",
      "support rep",
      "call center",
      "help desk",
      "administrative assistant",
      "admin assistant",
      "administrative",
      "office assistant",
      "receptionist",
      "coordinator",
      "scheduler",
      "clerk",
      "executive assistant",
    ],
    options: [
      "Find a better-paying job",
      "Find remote work",
      "Get hired as fast as possible",
      "Grow into a higher-skill role",
    ],
  },
  {
    keywords: [
      "barista",
      "cashier",
      "server",
      "host",
      "crew member",
      "retail",
      "sales associate",
      "store associate",
      "food service",
      "dishwasher",
      "line cook",
      "warehouse",
      "logistics",
      "forklift",
      "inventory",
      "delivery",
      "driver",
      "shipping",
      "receiving",
      "material handler",
      "stocker",
    ],
    options: [
      "Get hired as fast as possible",
      "Find a better-paying job",
      "Find a closer commute",
      "Get more flexibility",
    ],
  },
  {
    keywords: [
      "nurse",
      "medical assistant",
      "healthcare",
      "cna",
      "caregiver",
      "phlebotomist",
      "dental assistant",
      "clinic",
      "hospital",
    ],
    options: [
      "Find a better-paying job",
      "Find steady long-term work",
      "Find a closer commute",
      "Get more flexibility",
    ],
  },
  {
    keywords: [
      "electrician",
      "plumber",
      "hvac",
      "maintenance",
      "mechanic",
      "construction",
      "technician",
      "installer",
      "welder",
      "carpenter",
      "skilled trades",
      "trade",
    ],
    options: [
      "Find a better-paying job",
      "Find steady long-term work",
      "Grow into a higher-skill role",
      "Find a closer commute",
    ],
  },
  {
    keywords: [
      "manager",
      "project manager",
      "program manager",
      "product manager",
      "operations manager",
      "supervisor",
      "team lead",
      "director",
      "sales",
      "account executive",
      "business development",
      "marketing",
      "content",
      "social media",
    ],
    options: [
      "Find a better-paying job",
      "Grow into a higher-skill role",
      "Find remote work",
      "Find steady long-term work",
    ],
  },
] as const;

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function getJobGoalOptionsForRole(
  role: string | null | undefined,
  selectedGoals: string[] = [],
  limit = 4
) {
  const normalizedRole = normalizeText(role).toLowerCase();

  const prioritized = normalizedRole
    ? ROLE_GOAL_RULES.flatMap((rule) =>
        rule.keywords.some((keyword) => normalizedRole.includes(keyword))
          ? rule.options
          : []
      )
    : [];

  const seen = new Set<string>();
  const ordered = [
    ...selectedGoals,
    ...prioritized,
    ...DEFAULT_JOB_GOAL_OPTIONS,
    ...ALL_JOB_GOAL_OPTIONS,
  ].filter((option) => {
    if (
      !ALL_JOB_GOAL_OPTIONS.includes(
        option as (typeof ALL_JOB_GOAL_OPTIONS)[number]
      )
    ) {
      return false;
    }
    if (seen.has(option)) return false;
    seen.add(option);
    return true;
  });

  return ordered.slice(0, Math.max(1, limit));
}
