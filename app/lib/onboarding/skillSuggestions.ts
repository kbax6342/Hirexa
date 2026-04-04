const DEFAULT_SKILLS = [
  "Communication",
  "Problem Solving",
  "Teamwork",
  "Time Management",
  "Customer Service",
  "Scheduling",
  "Microsoft Office",
  "Data Entry",
] as const;

const ROLE_SKILL_RULES = [
  {
    keywords: [
      "software engineer",
      "software developer",
      "developer",
      "engineer",
      "frontend",
      "backend",
      "full stack",
      "web developer",
      "programmer",
      "qa",
    ],
    skills: [
      "JavaScript",
      "React",
      "Node.js",
      "APIs",
      "SQL",
      "Debugging",
      "Git",
      "UI Development",
    ],
  },
  {
    keywords: [
      "customer support",
      "customer service",
      "support specialist",
      "support rep",
      "help desk",
      "call center",
      "barista",
      "cashier",
      "server",
      "host",
    ],
    skills: [
      "Communication",
      "Customer Service",
      "Problem Solving",
      "Time Management",
      "Scheduling",
      "Teamwork",
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
    ],
    skills: [
      "Microsoft Office",
      "Scheduling",
      "Data Entry",
      "Communication",
      "Teamwork",
      "Organization",
    ],
  },
  {
    keywords: [
      "warehouse",
      "logistics",
      "stocker",
      "inventory",
      "forklift",
      "driver",
      "delivery",
      "shipping",
      "receiving",
    ],
    skills: [
      "Inventory",
      "Teamwork",
      "Time Management",
      "Problem Solving",
      "Equipment Operation",
      "Safety",
    ],
  },
  {
    keywords: [
      "sales",
      "sales associate",
      "account executive",
      "business development",
      "retail associate",
    ],
    skills: [
      "Sales",
      "Communication",
      "Customer Service",
      "Problem Solving",
      "Teamwork",
      "Relationship Building",
    ],
  },
  {
    keywords: [
      "skilled trades",
      "electrician",
      "plumber",
      "technician",
      "mechanic",
      "maintenance",
      "repair",
      "hvac",
      "welder",
    ],
    skills: [
      "Troubleshooting",
      "Equipment Repair",
      "Safety",
      "Maintenance",
      "Tools & Machinery",
      "Problem Solving",
    ],
  },
] as const;

const WORK_STORY_TO_SKILLS: Record<string, string[]> = {
  "Helped customers": ["Customer Service", "Communication", "Problem Solving"],
  "Built or fixed things": ["Troubleshooting", "Maintenance", "Problem Solving"],
  "Managed schedules": ["Scheduling", "Time Management", "Organization"],
  "Sold products or services": ["Sales", "Communication", "Relationship Building"],
  "Entered data": ["Data Entry", "Microsoft Office", "Attention to Detail"],
  "Led people": ["Leadership", "Teamwork", "Communication"],
  "Trained others": ["Training", "Communication", "Leadership"],
  "Wrote code": ["JavaScript", "APIs", "Debugging"],
  "Worked with tools or machinery": [
    "Tools & Machinery",
    "Equipment Operation",
    "Safety",
  ],
  "Organized inventory": ["Inventory", "Organization", "Time Management"],
  "Solved technical issues": ["Problem Solving", "Troubleshooting", "Debugging"],
  "Created content": ["Content Creation", "Communication", "Creativity"],
  "Handled money": ["Cash Handling", "Attention to Detail", "Customer Service"],
  "Drove or delivered": ["Delivery", "Time Management", "Reliability"],
  Other: ["Problem Solving"],
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeKey(value: string) {
  return normalizeText(value).toLowerCase();
}

function dedupeSkills(skills: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const skill of skills) {
    const normalized = normalizeText(skill);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function getSuggestedHighlightSkills(args: {
  role?: string | null;
  resumeSkills?: string[] | null;
  workStoryTags?: string[] | null;
  savedSkills?: string[] | null;
  limit?: number;
}) {
  const limit = Math.max(1, args.limit ?? 10);
  const normalizedRole = normalizeKey(args.role ?? "");

  const roleSkills = ROLE_SKILL_RULES.flatMap((rule) =>
    rule.keywords.some((keyword) => normalizedRole.includes(keyword))
      ? rule.skills
      : []
  );
  const resumeSkills = dedupeSkills(
    Array.isArray(args.resumeSkills) ? args.resumeSkills : []
  );
  const workStorySkills = dedupeSkills(
    (Array.isArray(args.workStoryTags) ? args.workStoryTags : []).flatMap(
      (tag) => WORK_STORY_TO_SKILLS[normalizeText(tag)] ?? []
    )
  );
  const savedSkills = dedupeSkills(
    Array.isArray(args.savedSkills) ? args.savedSkills : []
  );

  const ordered = dedupeSkills([
    ...roleSkills,
    ...workStorySkills,
    ...savedSkills,
    ...resumeSkills,
    ...DEFAULT_SKILLS,
  ]);

  return ordered.slice(0, limit);
}
