export const BASE_WORK_STORY_OPTIONS = [
  "Helped customers",
  "Built or fixed things",
  "Managed schedules",
  "Sold products or services",
  "Entered data",
  "Led people",
  "Trained others",
  "Wrote code",
  "Worked with tools or machinery",
  "Organized inventory",
  "Solved technical issues",
  "Created content",
  "Handled money",
  "Drove or delivered",
  "Other",
] as const;

const ROLE_PRIORITY_RULES = [
  {
    keywords: [
      "medical sonographer",
      "diagnostic medical sonographer",
      "sonographer",
      "ultrasound tech",
      "ultrasound technician",
      "ultrasonographer",
    ],
    options: [
      "Conducting ultrasound examinations",
      "Analyzing sonographic images",
      "Maintaining imaging equipment",
      "Collaborating with healthcare teams",
    ],
  },
  {
    keywords: [
      "software engineer",
      "software developer",
      "developer",
      "engineer",
      "programmer",
      "frontend",
      "backend",
      "full stack",
      "devops",
      "qa",
      "it support",
      "data analyst",
      "analyst",
    ],
    options: [
      "Wrote code",
      "Solved technical issues",
      "Built or fixed things",
      "Led people",
      "Trained others",
      "Created content",
      "Entered data",
      "Managed schedules",
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
      "retail",
      "cashier",
      "barista",
      "server",
      "host",
      "sales associate",
    ],
    options: [
      "Helped customers",
      "Solved technical issues",
      "Handled money",
      "Managed schedules",
      "Trained others",
      "Led people",
      "Sold products or services",
    ],
  },
  {
    keywords: [
      "warehouse",
      "logistics",
      "stocker",
      "forklift",
      "inventory",
      "delivery",
      "driver",
      "shipping",
      "receiving",
      "material handler",
    ],
    options: [
      "Organized inventory",
      "Drove or delivered",
      "Worked with tools or machinery",
      "Built or fixed things",
      "Managed schedules",
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
      "Managed schedules",
      "Entered data",
      "Helped customers",
      "Organized inventory",
      "Handled money",
      "Created content",
    ],
  },
  {
    keywords: [
      "sales",
      "account executive",
      "business development",
      "marketing",
      "content",
      "social media",
    ],
    options: [
      "Sold products or services",
      "Helped customers",
      "Created content",
      "Handled money",
      "Led people",
      "Trained others",
    ],
  },
  {
    keywords: [
      "manager",
      "lead",
      "supervisor",
      "project manager",
      "operations manager",
      "team lead",
    ],
    options: [
      "Led people",
      "Managed schedules",
      "Trained others",
      "Solved technical issues",
      "Created content",
      "Entered data",
    ],
  },
] as const;

function normalizeRole(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function getWorkStoryOptionsForRole(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role);

  if (!normalizedRole) {
    return [...BASE_WORK_STORY_OPTIONS];
  }

  const prioritized = ROLE_PRIORITY_RULES.flatMap((rule) =>
    rule.keywords.some((keyword) => normalizedRole.includes(keyword))
      ? rule.options
      : []
  );

  if (prioritized.length === 0) {
    return [...BASE_WORK_STORY_OPTIONS];
  }

  const seen = new Set<string>();
  const ordered = [...prioritized, ...BASE_WORK_STORY_OPTIONS].filter((option) => {
    if (seen.has(option)) return false;
    seen.add(option);
    return true;
  });

  return ordered;
}
