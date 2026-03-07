// File: /Hirexa/my-app/app/lib/agents/linkedinSim.ts
export type Lead = {
  name: string;
  company: string;
  title: string;
};

export type ContactLeadType =
  | "recruiter_search"
  | "hiring_manager_search"
  | "company_recruiting_email"
  | "company_contact_form"
  | "company_support_inbox"
  | "careers_page_contact";

export type CampaignInput = {
  shortBio?: string | null;
};

export type LinkedInAccountInput = {
  importedName?: string | null;
  importedHeadline?: string | null;
  importedSkills?: string[] | null;
  importedLocation?: string | null;
};

export function parseCommaList(input: string): string[] {
  const items = input
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function interpolateTemplate(
  body: string,
  lead: Lead,
  campaign?: CampaignInput | null,
  linkedInAccount?: LinkedInAccountInput | null
): string {
  const firstName =
    lead.name
      .split(" ")
      .map((part) => part.trim())
      .filter(Boolean)[0] || lead.name;

  const values: Record<string, string> = {
    first_name: firstName,
    company: lead.company,
    job_title: lead.title,
    user_name: linkedInAccount?.importedName?.trim() || "a candidate",
    user_headline: linkedInAccount?.importedHeadline?.trim() || "",
    short_bio: campaign?.shortBio?.trim() || "",
  };

  return body.replace(
    /\{(first_name|company|job_title|user_name|user_headline|short_bio)\}/g,
    (_, key: string) => values[key] ?? ""
  );
}

function insertAfterGreeting(body: string, line: string) {
  const lines = body.split("\n");
  if (lines.length === 0) return line;
  const next = [...lines];
  next.splice(1, 0, "", line);
  return next.join("\n");
}

export function applyLeadTypeTemplate(
  baseBody: string,
  leadType?: ContactLeadType | null
): string {
  const type = leadType ?? "recruiter_search";

  switch (type) {
    case "company_contact_form":
      return insertAfterGreeting(
        baseBody,
        "I am reaching out via your contact form about {job_title} roles at {company}."
      );
    case "careers_page_contact":
      return insertAfterGreeting(
        baseBody,
        "I found the role on your careers page and wanted to reach out directly."
      );
    case "company_recruiting_email":
      return insertAfterGreeting(
        baseBody,
        "I am reaching out to the recruiting team about {job_title} roles at {company}."
      );
    case "company_support_inbox":
      return insertAfterGreeting(
        baseBody,
        "If this inbox is not for recruiting, I would appreciate a forward to the hiring team."
      );
    default:
      return baseBody;
  }
}

export type DefaultTemplateParams = {
  company: string;
  jobTitle: string;
  importedName?: string | null;
  importedHeadline?: string | null;
  shortBio?: string | null;
  importedSkills?: string[] | null;
};

export function generateDefaultTemplate(params: DefaultTemplateParams): string {
  const name = params.importedName?.trim();
  const headline = params.importedHeadline?.trim();
  const shortBio = params.shortBio?.trim();
  const skills = (params.importedSkills ?? []).map((skill) => skill.trim()).filter(Boolean);

  const intro =
    name && headline
      ? `I'm ${name}, ${headline}.`
      : name
        ? `I'm ${name}.`
        : headline
          ? `I'm ${headline}.`
          : "I'm reaching out because I'm interested in the opportunity.";

  const bioLine = shortBio ? `A quick intro: ${shortBio}.` : "";
  const skillLine = skills.length > 0 ? `Strengths include ${skills.slice(0, 3).join(", ")}.` : "";

  return [
    "Hi {first_name},",
    "",
    `I came across the ${params.jobTitle} role at ${params.company} and wanted to introduce myself.`,
    intro,
    bioLine,
    skillLine,
    "I'd appreciate any insight you can share about the role, team, or hiring process.",
    "",
    "Thank you for your time,",
    "{user_name}",
  ]
    .filter(Boolean)
    .join("\n");
}

export type DraftTemplateParams = {
  tone: "professional" | "friendly" | "confident";
  shortBio?: string | null;
  importedName?: string | null;
  importedHeadline?: string | null;
  importedSkills?: string[] | null;
  company: string;
  jobTitle: string;
};

export function generateDraftTemplate(params: DraftTemplateParams): string {
  const toneOpeners: Record<DraftTemplateParams["tone"], string> = {
    professional: "Hello {first_name},",
    friendly: "Hi {first_name},",
    confident: "Hi {first_name},",
  };

  const toneLines: Record<DraftTemplateParams["tone"], string> = {
    professional:
      "I would value any guidance you can share on fit or next steps in the process.",
    friendly:
      "If you have a moment, I’d love any insight on the role or the team.",
    confident:
      "I believe my background aligns strongly with the opportunity and would welcome the chance to connect.",
  };

  const name = params.importedName?.trim();
  const headline = params.importedHeadline?.trim();
  const shortBio = params.shortBio?.trim();
  const skills = (params.importedSkills ?? []).map((skill) => skill.trim()).filter(Boolean);

  const intro =
    name && headline
      ? `I'm ${name}, ${headline}.`
      : name
        ? `I'm ${name}.`
        : headline
          ? `I'm ${headline}.`
          : "I'm reaching out with interest in the role.";

  const bioLine = shortBio ? `A short background on me: ${shortBio}.` : "";
  const skillLine = skills.length > 0 ? `Core strengths: ${skills.slice(0, 3).join(", ")}.` : "";

  return [
    toneOpeners[params.tone],
    "",
    `I recently came across the ${params.jobTitle} opportunity at ${params.company} and wanted to reach out.`,
    intro,
    bioLine,
    skillLine,
    toneLines[params.tone],
    "",
    "Best,",
    "{user_name}",
  ]
    .filter(Boolean)
    .join("\n");
}

export type DummyLeadsParams = {
  company: string;
  jobTitle: string;
  count: number;
};

export type DummyLead = {
  name: string;
  company: string;
  title: string;
  linkedinUrl: string;
  connectionLevel: string;
};

export function generateDummyLeadsForJob(
  params: DummyLeadsParams
): DummyLead[] {
  const firstNames = [
    "Alex",
    "Jordan",
    "Taylor",
    "Morgan",
    "Casey",
    "Riley",
    "Avery",
    "Jamie",
    "Quinn",
    "Parker",
  ];

  const lastNames = [
    "Lee",
    "Patel",
    "Nguyen",
    "Garcia",
    "Kim",
    "Brown",
    "Davis",
    "Wilson",
    "Martinez",
    "Clark",
  ];

  const recruiterTitles = [
    "Recruiter",
    "Technical Recruiter",
    "Senior Recruiter",
    "Hiring Manager",
    "Talent Partner",
  ];

  const levels = ["1st", "2nd", "3rd"];
  const count = Math.max(0, Math.floor(params.count));
  const results: DummyLead[] = [];

  for (let i = 0; i < count; i += 1) {
    const first = firstNames[i % firstNames.length];
    const last = lastNames[(i * 3) % lastNames.length];
    const name = `${first} ${last}`;
    const title = recruiterTitles[i % recruiterTitles.length];
    const connectionLevel = levels[i % levels.length];

    const slugName = slugify(name);
    const slugCompany = slugify(params.company);
    const linkedinUrl = `https://www.linkedin.com/in/${slugName}-${slugCompany}-${i + 1}`;

    results.push({
      name,
      company: params.company,
      title,
      linkedinUrl,
      connectionLevel,
    });
  }

  return results;
}

export type BuildCampaignFromJobParams = {
  company: string;
  title: string;
  location?: string | null;
};

export type CampaignDefaults = {
  targetCompanies: string[];
  targetRoles: string[];
  targetTitles: string[];
  location?: string | null;
};

function deriveRoleFromTitle(title: string): string {
  const cleaned = title
    .replace(
      /\b(Senior|Sr\.?|Junior|Jr\.?|Lead|Principal|Staff|Manager|Director|Head|VP|Vice President|Chief)\b/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  const primary = cleaned.split(/[\/,|]| - /)[0]?.trim();
  return primary && primary.length > 0 ? primary : title.trim();
}

export function buildCampaignFromJob(
  params: BuildCampaignFromJobParams
): CampaignDefaults {
  const role = deriveRoleFromTitle(params.title);

  return {
    targetCompanies: params.company ? [params.company] : [],
    targetRoles: role ? [role] : [],
    targetTitles: params.title ? [params.title] : [],
    location: params.location ?? null,
  };
}

export type SuggestedShortBioParams = {
  importedName?: string | null;
  importedHeadline?: string | null;
  importedSkills?: string[] | null;
  recentTitle?: string | null;
  recentCompany?: string | null;
  location?: string | null;
  roleFocus?: string | null;
};

export function buildSuggestedShortBio(params: SuggestedShortBioParams): string {
  const headline = params.importedHeadline?.trim() || "";
  const recentTitle = params.recentTitle?.trim() || "";
  const recentCompany = params.recentCompany?.trim() || "";
  const roleFocus = params.roleFocus?.trim() || "";
  const location = params.location?.trim() || "";
  const skills = (params.importedSkills ?? []).map((skill) => skill.trim()).filter(Boolean);

  const opener = headline
    ? headline.includes(" at ") || headline.includes("@")
      ? `I'm ${headline}.`
      : `I'm a ${headline}.`
    : recentTitle
      ? `I'm a ${recentTitle}.`
      : roleFocus
        ? `I'm focused on ${roleFocus} roles.`
        : "I'm a motivated candidate exploring new opportunities.";

  const companyLine = recentCompany ? `Most recently with ${recentCompany}.` : "";
  const skillsLine = skills.length > 0 ? `Strengths include ${skills.slice(0, 3).join(", ")}.` : "";
  const locationLine = location ? `Based in ${location}.` : "";

  return [opener, companyLine, skillsLine, locationLine].filter(Boolean).join(" ");
}
