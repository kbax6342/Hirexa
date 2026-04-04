export type JobQueryFamily =
  | "service_frontline"
  | "office_admin"
  | "professional"
  | "technical"
  | "management"
  | "general";

type ExpansionRule = {
  test: RegExp;
  queries: string[];
};

const REMOTE_INTENT_REGEX =
  /\b(remote|work from home|wfh|telecommute|telecommuting|virtual)\b/i;

const FAMILY_CLASSIFIERS: Array<{
  family: Exclude<JobQueryFamily, "general">;
  test: RegExp;
}> = [
  {
    family: "management",
    test:
      /\b(product manager|project manager|program manager|operations manager|store manager|assistant manager|manager|director|head of|vice president|vp|supervisor|scrum master)\b/i,
  },
  {
    family: "technical",
    test:
      /\b(software engineer|software developer|developer|engineer|full stack|frontend|front end|backend|back end|devops|site reliability|sre|qa|quality assurance|sdet|test engineer|automation tester|data engineer|data scientist|machine learning|ml engineer|it support|help desk|cybersecurity|network engineer|cloud)\b/i,
  },
  {
    family: "service_frontline",
    test:
      /\b(barista|cashier|server|waiter|waitress|retail associate|sales associate|store associate|stocker|stock associate|warehouse|warehouse associate|warehouse worker|customer service rep|customer service representative|customer service associate|crew member|dishwasher|host|delivery driver|line cook|food service|restaurant|cafe|coffee shop|prep cook|busser|material handler|picker|packer|forklift|guest service|guest services|call center|frontline|grocery|retail|shift lead)\b/i,
  },
  {
    family: "office_admin",
    test:
      /\b(admin|administrative|administrative assistant|office assistant|office coordinator|receptionist|front desk|data entry|scheduler|dispatcher|executive assistant|clerical)\b/i,
  },
  {
    family: "professional",
    test:
      /\b(accountant|bookkeeper|financial analyst|finance|marketing|communications?|content specialist|hr|human resources|recruiter|recruiting|talent acquisition|business analyst|operations analyst|paralegal|teacher|legal assistant|buyer|purchasing)\b/i,
  },
];

const FAMILY_EXPANSIONS: Record<
  Exclude<JobQueryFamily, "general">,
  ExpansionRule[]
> = {
  service_frontline: [
    {
      test: /\bbarista\b|\bcafe\b|\bcoffee shop\b/i,
      queries: ["Barista", "Cafe Barista", "Coffee Shop Barista"],
    },
    {
      test: /\bcashier\b/i,
      queries: ["Cashier", "Retail Cashier", "Store Associate"],
    },
    {
      test: /\b(customer service|guest service|guest services|call center)\b/i,
      queries: [
        "Customer Service Representative",
        "Customer Service Associate",
        "Guest Services",
      ],
    },
    {
      test: /\b(retail|retail associate|sales associate|store associate|stocker|stock associate)\b/i,
      queries: [
        "Retail Associate",
        "Store Associate",
        "Sales Associate",
        "Stock Associate",
      ],
    },
    {
      test: /\b(server|waiter|waitress|host|crew member|food service|restaurant|dishwasher|line cook|prep cook|busser)\b/i,
      queries: [
        "Crew Member",
        "Food Service Worker",
        "Server",
        "Host",
        "Line Cook",
        "Dishwasher",
      ],
    },
    {
      test: /\b(warehouse|warehouse associate|warehouse worker|material handler|picker|packer|forklift|delivery driver)\b/i,
      queries: [
        "Warehouse Associate",
        "Material Handler",
        "Picker Packer",
        "Delivery Driver",
        "Stocker",
      ],
    },
  ],
  office_admin: [
    {
      test: /\b(admin|administrative|office)\b/i,
      queries: [
        "Administrative Assistant",
        "Office Assistant",
        "Office Coordinator",
      ],
    },
    {
      test: /\b(receptionist|front desk)\b/i,
      queries: ["Receptionist", "Front Desk Coordinator"],
    },
    {
      test: /\b(data entry|clerical)\b/i,
      queries: ["Data Entry Clerk", "Office Assistant"],
    },
    {
      test: /\b(scheduler|dispatcher)\b/i,
      queries: ["Scheduler", "Dispatcher", "Office Coordinator"],
    },
  ],
  professional: [
    {
      test: /\b(marketing|communications?|content)\b/i,
      queries: [
        "Marketing Coordinator",
        "Marketing Specialist",
        "Communications Specialist",
      ],
    },
    {
      test: /\b(finance|financial|accountant|bookkeeper)\b/i,
      queries: ["Accountant", "Financial Analyst", "Bookkeeper"],
    },
    {
      test: /\b(recruiter|recruiting|human resources|hr|talent acquisition)\b/i,
      queries: ["Recruiter", "HR Coordinator", "Talent Acquisition"],
    },
    {
      test: /\b(analyst|operations analyst|business analyst)\b/i,
      queries: ["Business Analyst", "Operations Analyst", "Reporting Analyst"],
    },
  ],
  technical: [
    {
      test: /\b(software engineer|software developer|developer|full stack|frontend|front end|backend|back end)\b/i,
      queries: [
        "Software Engineer",
        "Software Developer",
        "Full Stack Developer",
        "Frontend Developer",
        "Backend Developer",
      ],
    },
    {
      test: /\b(qa|quality assurance|sdet|test engineer|automation tester)\b/i,
      queries: [
        "QA Engineer",
        "Quality Assurance",
        "Test Engineer",
        "SDET",
      ],
    },
    {
      test: /\b(data engineer|data scientist|machine learning|ml engineer)\b/i,
      queries: ["Data Engineer", "Data Scientist", "Machine Learning Engineer"],
    },
    {
      test: /\b(it support|help desk|network|cloud|cybersecurity)\b/i,
      queries: ["IT Support", "Help Desk", "Network Engineer", "Cloud Engineer"],
    },
  ],
  management: [
    {
      test: /\b(product manager|product operations)\b/i,
      queries: ["Product Manager", "Product Operations", "Product Analyst"],
    },
    {
      test: /\b(project manager|program manager)\b/i,
      queries: ["Project Manager", "Program Manager", "Operations Manager"],
    },
    {
      test: /\b(operations manager|store manager|assistant manager|supervisor)\b/i,
      queries: ["Operations Manager", "Store Manager", "Supervisor"],
    },
  ],
};

const FAMILY_DEFAULT_QUERIES: Record<
  Exclude<JobQueryFamily, "general">,
  string[]
> = {
  service_frontline: [
    "Customer Service Associate",
    "Retail Associate",
    "Food Service Worker",
    "Warehouse Associate",
  ],
  office_admin: [
    "Administrative Assistant",
    "Office Assistant",
    "Office Coordinator",
  ],
  professional: ["Business Analyst", "Marketing Specialist", "Financial Analyst"],
  technical: ["Software Engineer", "Software Developer", "QA Engineer"],
  management: ["Project Manager", "Program Manager", "Operations Manager"],
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeQueries(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function classifyJobQueryFamily(query: string): JobQueryFamily {
  const normalized = normalizeText(query);
  if (!normalized || normalized === "job" || normalized === "jobs") {
    return "general";
  }

  for (const entry of FAMILY_CLASSIFIERS) {
    if (entry.test.test(normalized)) {
      return entry.family;
    }
  }

  return "general";
}

export function filterQueriesToRoleFamily(
  queries: Array<string | null | undefined>,
  family: JobQueryFamily
) {
  if (family === "general") {
    return dedupeQueries(queries);
  }

  return dedupeQueries(
    queries.filter((query) => classifyJobQueryFamily(String(query ?? "")) === family)
  );
}

export function buildRoleFamilyExpansionQueries(
  query: string,
  family?: JobQueryFamily
) {
  const normalized = normalizeText(query);
  const resolvedFamily = family ?? classifyJobQueryFamily(normalized);
  if (!normalized || resolvedFamily === "general") {
    return [];
  }

  const matched = FAMILY_EXPANSIONS[resolvedFamily].flatMap((entry) =>
    entry.test.test(normalized) ? entry.queries : []
  );

  return dedupeQueries(
    matched.length > 0 ? matched : FAMILY_DEFAULT_QUERIES[resolvedFamily]
  );
}

export function hasRemoteIntent(
  query: string | null | undefined,
  location: string | null | undefined
) {
  return REMOTE_INTENT_REGEX.test(query ?? "") || REMOTE_INTENT_REGEX.test(location ?? "");
}
