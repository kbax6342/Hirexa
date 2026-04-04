export const ALL_JOB_PRIORITY_OPTIONS = [
  "Higher pay",
  "Remote work",
  "Flexible schedule",
  "Fast hiring process",
  "Career growth",
  "Good benefits",
  "Less stress",
  "Short commute",
  "Entry-level friendly",
] as const;

const DEFAULT_PRIORITY_OPTIONS = [
  "Higher pay",
  "Career growth",
  "Good benefits",
  "Flexible schedule",
] as const;

const ROLE_PRIORITY_RULES = [
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
      "Higher pay",
      "Remote work",
      "Career growth",
      "Flexible schedule",
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
    ],
    options: [
      "Higher pay",
      "Remote work",
      "Flexible schedule",
      "Career growth",
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
    ],
    options: [
      "Higher pay",
      "Flexible schedule",
      "Short commute",
      "Fast hiring process",
    ],
  },
  {
    keywords: [
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
      "Higher pay",
      "Fast hiring process",
      "Short commute",
      "Good benefits",
    ],
  },
  {
    keywords: [
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
      "Higher pay",
      "Remote work",
      "Good benefits",
      "Career growth",
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
      "Higher pay",
      "Good benefits",
      "Flexible schedule",
      "Short commute",
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
      "Higher pay",
      "Good benefits",
      "Short commute",
      "Fast hiring process",
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
    ],
    options: [
      "Higher pay",
      "Career growth",
      "Good benefits",
      "Remote work",
    ],
  },
] as const;

function normalizeRole(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function getJobPriorityOptionsForRole(
  role: string | null | undefined,
  selectedPriorities: string[] = [],
  limit = 4
) {
  const normalizedRole = normalizeRole(role);

  const prioritized = normalizedRole
    ? ROLE_PRIORITY_RULES.flatMap((rule) =>
        rule.keywords.some((keyword) => normalizedRole.includes(keyword))
          ? rule.options
          : []
      )
    : [];

  const seen = new Set<string>();
  const ordered = [
    ...selectedPriorities,
    ...prioritized,
    ...DEFAULT_PRIORITY_OPTIONS,
    ...ALL_JOB_PRIORITY_OPTIONS,
  ].filter((option) => {
    if (!ALL_JOB_PRIORITY_OPTIONS.includes(option as (typeof ALL_JOB_PRIORITY_OPTIONS)[number])) {
      return false;
    }
    if (seen.has(option)) return false;
    seen.add(option);
    return true;
  });

  return ordered.slice(0, Math.max(1, limit));
}
