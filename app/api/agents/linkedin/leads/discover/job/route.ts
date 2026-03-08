import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getAuthedUserId, unauthorizedJson } from "@/app/lib/agents/getAuthedUser";
import { fetchSmartMatchJobById } from "@/app/lib/jobs/smartMatches";

const RECRUITER_TITLES = [
  "Technical Recruiter",
  "Engineering Recruiter",
  "Senior Recruiter",
  "Talent Partner",
  "Hiring Manager",
  "Technical Sourcer",
  "Staffing Manager",
  "Talent Acquisition Partner",
];

const HIRING_MANAGER_TITLES = [
  "Engineering Manager",
  "Senior Engineering Manager",
  "Director of Engineering",
  "Head of Engineering",
  "VP Engineering",
  "Head of Product",
  "Product Director",
  "Hiring Manager",
];

const BLOCKED_HOSTS = new Set([
  "boards.greenhouse.io",
  "jobs.lever.co",
  "www.linkedin.com",
  "linkedin.com",
  "www.indeed.com",
  "indeed.com",
  "www.glassdoor.com",
  "glassdoor.com",
  "www.workday.com",
  "workday.com",
  "www.adzuna.com",
  "adzuna.com",
]);

function buildLinkedInSearchUrl(company: string, title: string) {
  const keywords = `${company} ${title}`.trim();
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
    keywords
  )}`;
}

function safeDomain(jobUrl?: string | null) {
  if (!jobUrl) return null;
  try {
    const host = new URL(jobUrl).hostname.replace(/^www\./, "");
    if (!host || BLOCKED_HOSTS.has(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function buildContactLeads(params: { company: string; jobUrl?: string | null }) {
  const leads: Array<{
    name: string;
    title: string;
    linkedinUrl: string;
    leadType: string;
    contactEmail?: string | null;
    confidence: number;
    connectionLevel: string;
  }> = [];

  if (params.jobUrl) {
    leads.push({
      name: `${params.company} Careers Page`,
      title: "Careers Page",
      linkedinUrl: params.jobUrl,
      leadType: "careers_page_contact",
      confidence: 80,
      connectionLevel: "direct",
    });

    try {
      const origin = new URL(params.jobUrl).origin;
      leads.push({
        name: `${params.company} Contact Form`,
        title: "Contact Form",
        linkedinUrl: `${origin}/contact`,
        leadType: "company_contact_form",
        confidence: 55,
        connectionLevel: "direct",
      });
    } catch {
      // ignore invalid URL
    }
  }

  const domain = safeDomain(params.jobUrl);
  if (domain) {
    const recruitingEmail = `careers@${domain}`;
    leads.push({
      name: "Recruiting Team",
      title: "Recruiting Email",
      linkedinUrl: `mailto:${recruitingEmail}`,
      leadType: "company_recruiting_email",
      contactEmail: recruitingEmail,
      confidence: 45,
      connectionLevel: "direct",
    });
  }

  return leads;
}

function dedupeLeads<T extends { company?: string; title: string; linkedinUrl: string; contactEmail?: string | null }>(
  company: string,
  leads: T[]
) {
  const seen = new Set<string>();
  return leads.filter((lead) => {
    const key = [
      company.toLowerCase(),
      lead.title.toLowerCase(),
      (lead.linkedinUrl ?? "").toLowerCase(),
      (lead.contactEmail ?? "").toLowerCase(),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type Payload = { jobTargetId?: string };

export async function POST(req: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return unauthorizedJson();

  const payload = (await req.json()) as Payload | null;
  const jobTargetId = typeof payload?.jobTargetId === "string" ? payload.jobTargetId.trim() : "";
  if (!jobTargetId) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const jobTarget = await prisma.outreachJobTarget.findFirst({
    where: { id: jobTargetId, userId },
    select: {
      id: true,
      campaignId: true,
      jobId: true,
      company: true,
      title: true,
    },
  });

  if (!jobTarget) {
    return NextResponse.json({ ok: false, error: "Job target not found" }, { status: 404 });
  }

  const company = jobTarget.company?.trim() || "Company";
  const origin = new URL(req.url).origin;
  const smartJob = await fetchSmartMatchJobById({
    userId,
    jobId: jobTarget.jobId,
    origin,
  });
  const jobUrl = smartJob?.jobUrl ?? null;

  const recruiterLeads = RECRUITER_TITLES.map((title) => ({
    name: `${company} ${title}`,
    company,
    title,
    linkedinUrl: buildLinkedInSearchUrl(company, title),
    leadType: "recruiter_search",
    contactEmail: null,
    confidence: 55,
    connectionLevel: "search",
  }));

  const hiringManagerLeads = HIRING_MANAGER_TITLES.map((title) => ({
    name: `${company} ${title}`,
    company,
    title,
    linkedinUrl: buildLinkedInSearchUrl(company, title),
    leadType: "hiring_manager_search",
    contactEmail: null,
    confidence: 50,
    connectionLevel: "search",
  }));

  const contactLeads = buildContactLeads({ company, jobUrl }).map((lead) => ({
    ...lead,
    company,
  }));

  const leads = dedupeLeads(company, [
    ...recruiterLeads,
    ...hiringManagerLeads,
    ...contactLeads,
  ]);

  const createResult = await prisma.recruiterLead.createMany({
    data: leads.map((lead) => ({
      campaignId: jobTarget.campaignId,
      outreachJobTargetId: jobTarget.id,
      name: lead.name,
      company: lead.company,
      title: lead.title,
      linkedinUrl: lead.linkedinUrl,
      leadType: lead.leadType,
      contactEmail: lead.contactEmail ?? null,
      confidence: lead.confidence,
      connectionLevel: lead.connectionLevel ?? "search",
    })),
    skipDuplicates: true,
  });

  if (createResult.count > 0) {
    await prisma.outreachJobTarget.update({
      where: { id: jobTarget.id },
      data: { leadsFound: { increment: createResult.count } },
    });
  }

  return NextResponse.json({ ok: true, createdCount: createResult.count });
}
