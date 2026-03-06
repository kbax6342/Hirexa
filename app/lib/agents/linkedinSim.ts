export type CampaignSeed = {
  targetCompanies: string[];
  targetRoles: string[];
  targetTitles: string[];
};

export type DummyLead = {
  name: string;
  company: string;
  title: string;
  linkedinUrl: string;
  connectionLevel: "1st" | "2nd" | "3rd";
};

const FIRST_NAMES = ["Alex", "Taylor", "Jordan", "Sam", "Casey", "Morgan", "Riley", "Jamie", "Avery", "Quinn"];
const LAST_NAMES = ["Johnson", "Patel", "Martinez", "Nguyen", "Kim", "Williams", "Singh", "Brown", "Lopez", "Davis"];

export function parseCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shortHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 0xffffff;
  }
  return hash.toString(36).padStart(4, "0").slice(0, 6);
}

export function interpolateTemplate(
  body: string,
  lead: { name: string; company: string; title: string }
) {
  const firstName = lead.name.split(" ")[0] ?? lead.name;
  return body
    .replaceAll("{first_name}", firstName)
    .replaceAll("{company}", lead.company)
    .replaceAll("{job_title}", lead.title);
}

export function generateDummyLeads(campaign: CampaignSeed): DummyLead[] {
  const companies = campaign.targetCompanies.length ? campaign.targetCompanies : ["Acme Corp"];
  const titles = campaign.targetTitles.length
    ? campaign.targetTitles
    : campaign.targetRoles.length
      ? campaign.targetRoles.map((role) => `${role} Recruiter`)
      : ["Technical Recruiter"];

  const total = 10 + Math.floor(Math.random() * 16);
  const leads: DummyLead[] = [];

  for (let index = 0; index < total; index += 1) {
    const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(index * 3) % LAST_NAMES.length];
    const name = `${firstName} ${lastName}`;
    const company = companies[index % companies.length];
    const title = titles[index % titles.length];
    const signature = shortHash(`${name}-${company}-${title}-${index}`);
    const linkedinUrl = `https://www.linkedin.com/in/${slug(name)}-${slug(company)}-${signature}`;
    const levelOrder: Array<"1st" | "2nd" | "3rd"> = ["1st", "2nd", "3rd"];

    leads.push({
      name,
      company,
      title,
      linkedinUrl,
      connectionLevel: levelOrder[index % levelOrder.length],
    });
  }

  return leads;
}
