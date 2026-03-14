import "server-only";

import type {
  Job,
  JobDetail,
  JobDetailSection,
  JobPretty,
  JobSource,
} from "./types";
import { prettyFromDescription } from "./pretty-from-text";
import { fetchAdzunaJobDetails } from "../providers/adzuna";
import {
  cleanText,
  fetchJson,
  formatPostedLabel,
  humanizeSlug,
  type SourceFetchArgs,
} from "./sources/common";

type ResolveJobDetailArgs = {
  id: string;
  origin: string;
  summary?: Job | null;
};

export type ResolvedJobDetail = {
  job: JobDetail;
  pretty: JobPretty;
  fullDetailsUnavailable?: boolean;
};

type DecodedJobId = {
  source: JobSource;
  parts: string[];
};

type LeverDetailResponse = {
  id?: string;
  text?: string;
  createdAt?: number;
  hostedUrl?: string;
  applyUrl?: string;
  description?: string;
  descriptionPlain?: string;
  categories?: {
    location?: string;
    team?: string;
    department?: string;
    commitment?: string;
  };
  lists?: Array<{
    text?: string;
    content?: string;
  }>;
  salaryDescription?: string;
};

type AshbyDetailResponse = {
  job?: {
    id?: string;
    title?: string;
    applyUrl?: string;
    publishedAt?: string;
    employmentType?: string;
    descriptionHtml?: string;
    descriptionPlain?: string;
    location?: string | { name?: string | null } | null;
    teamName?: string;
    departmentName?: string;
  };
  id?: string;
  title?: string;
  applyUrl?: string;
  publishedAt?: string;
  employmentType?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  location?: string | { name?: string | null } | null;
  teamName?: string;
  departmentName?: string;
};

type WorkableDetailResponse = {
  id?: string;
  title?: string;
  shortlink?: string;
  application_url?: string;
  description?: string;
  created_at?: string;
  employment_type?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
  } | null;
};

type USAJobsDetailResponse = {
  SearchResult?: {
    SearchResultItems?: Array<{
      MatchedObjectId?: string;
      MatchedObjectDescriptor?: {
        PositionTitle?: string;
        PositionLocationDisplay?: string;
        PositionURI?: string;
        OrganizationName?: string;
        PublicationStartDate?: string;
        ApplicationCloseDate?: string;
        JobCategory?: Array<{ Name?: string }>;
        PositionRemuneration?: Array<{
          MinimumRange?: string;
          MaximumRange?: string;
          Description?: string;
        }>;
        UserArea?: {
          Details?: {
            JobSummary?: string;
            MajorDuties?: string[];
            QualificationSummary?: string;
            WhoMayApply?: string;
            HiringPath?: string[];
            ConditionsOfEmployment?: string;
            KeyRequirements?: string[];
            Education?: string;
            AdditionalInformation?: string;
            OtherInformation?: string;
            Evaluations?: string;
            RequiredDocuments?: string;
            Benefits?: string;
            HowToApply?: string;
            WhatToExpectNext?: string;
            SecurityClearance?: string;
            TeleworkEligible?: string | boolean;
            TravelCode?: string;
            LowGrade?: string;
            HighGrade?: string;
            Relocation?: string;
            DrugTestRequired?: string;
            Remuneration?: Array<{ MinimumRange?: string; MaximumRange?: string }>;
            PositionSchedule?: Array<{ Name?: string }>;
            PositionOfferingType?: Array<{ Name?: string }>;
          };
        };
      };
    }>;
  };
};

type RemotiveApiResponse = {
  jobs?: Array<{
    id?: string | number;
    title?: string;
    company_name?: string;
    candidate_required_location?: string;
    url?: string;
    publication_date?: string;
    description?: string;
    job_type?: string;
    salary?: string;
  }>;
};

type RemoteOkApiJob = {
  id?: string | number;
  position?: string;
  company?: string;
  date?: string;
  description?: string;
  url?: string;
  location?: string;
  tags?: string[];
  salary_min?: number;
  salary_max?: number;
};

function looksLikeHtml(value: string | null | undefined) {
  return Boolean(value && /<[^>]+>/.test(value));
}

function cleanPlainText(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripHtml(html: string) {
  return cleanPlainText(
    html
      .replace(/<\/(p|div|br|li|h1|h2|h3|h4|h5|h6|section|article|ul|ol)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " ")
  );
}

function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function splitParagraphBlocks(value: string) {
  return cleanPlainText(value)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function collectSectionText(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSectionText(item));
  }

  if (typeof value === "boolean") {
    return [value ? "Yes" : "No"];
  }

  const text = cleanPlainText(typeof value === "string" ? value : "");
  return text ? [text] : [];
}

function toParagraphs(...values: unknown[]) {
  return values
    .flatMap((value) => collectSectionText(value))
    .flatMap((value) => splitParagraphBlocks(value));
}

function toBullets(...values: unknown[]) {
  return values
    .flatMap((value) => collectSectionText(value))
    .flatMap((value) => {
      const lineItems = value
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^[-*\u2022]\s*/, ""));

      if (lineItems.length > 1) {
        return lineItems;
      }

      const semicolonItems = value
        .split(/\s*;\s+/)
        .map((item) => item.trim())
        .filter(Boolean);

      return semicolonItems.length > 1 ? semicolonItems : [value];
    })
    .filter(Boolean);
}

function formatCalendarDate(value: string | null | undefined) {
  const raw = cleanPlainText(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatUsaJobsSalary(
  remuneration:
    | Array<{
        MinimumRange?: string;
        MaximumRange?: string;
        Description?: string;
      }>
    | null
    | undefined
) {
  const primary = remuneration?.[0];
  if (!primary) return null;

  const minimum = cleanPlainText(primary.MinimumRange);
  const maximum = cleanPlainText(primary.MaximumRange);
  const description = cleanPlainText(primary.Description);

  if (minimum && maximum) return `${minimum} - ${maximum}`;
  if (minimum) return `From ${minimum}`;
  if (maximum) return `Up to ${maximum}`;
  return description || null;
}

function createParagraphSection(
  title: string,
  ...values: unknown[]
): JobDetailSection | null {
  const paragraphs = toParagraphs(...values);
  if (!paragraphs.length) return null;
  return {
    title,
    kind: "paragraphs",
    paragraphs,
  };
}

function createBulletSection(
  title: string,
  ...values: unknown[]
): JobDetailSection | null {
  const bullets = toBullets(...values);
  if (!bullets.length) return null;
  return {
    title,
    kind: "bullets",
    bullets,
  };
}

function createFlexibleSection(
  title: string,
  ...values: unknown[]
): JobDetailSection | null {
  const bullets = toBullets(...values);
  if (bullets.length > 1) {
    return {
      title,
      kind: "bullets",
      bullets,
    };
  }

  return createParagraphSection(title, ...values);
}

function renderStructuredSectionHtml(section: JobDetailSection) {
  if (section.kind === "bullets" && section.bullets?.length) {
    return `<section><h3>${escapeHtmlText(section.title)}</h3><ul>${section.bullets
      .map((bullet) => `<li>${escapeHtmlText(bullet)}</li>`)
      .join("")}</ul></section>`;
  }

  if (section.kind === "paragraphs" && section.paragraphs?.length) {
    return `<section><h3>${escapeHtmlText(section.title)}</h3>${section.paragraphs
      .map((paragraph) => `<p>${escapeHtmlText(paragraph)}</p>`)
      .join("")}</section>`;
  }

  if (section.kind === "smallprint" && section.paragraphs?.length) {
    return `<section><h3>${escapeHtmlText(section.title)}</h3>${section.paragraphs
      .map((paragraph) => `<p>${escapeHtmlText(paragraph)}</p>`)
      .join("")}</section>`;
  }

  if (section.kind === "callout" && section.callout) {
    const label = section.callout.label
      ? `<strong>${escapeHtmlText(section.callout.label)}:</strong> `
      : "";
    return `<section><h3>${escapeHtmlText(section.title)}</h3><p>${label}${escapeHtmlText(
      section.callout.value
    )}</p></section>`;
  }

  return "";
}

function buildUsaJobsDetailHtml(params: {
  metadataItems: Array<{ label: string; value: string }>;
  sections: JobDetailSection[];
}) {
  const metadataHtml = params.metadataItems.length
    ? `<section><h3>Job Details</h3><ul>${params.metadataItems
        .map(
          (item) =>
            `<li><strong>${escapeHtmlText(item.label)}:</strong> ${escapeHtmlText(
              item.value
            )}</li>`
        )
        .join("")}</ul></section>`
    : "";

  const sectionsHtml = params.sections
    .map((section) => renderStructuredSectionHtml(section))
    .filter(Boolean)
    .join("\n");

  return [metadataHtml, sectionsHtml].filter(Boolean).join("\n");
}

function readDescriptionText(job: Pick<Job, "description" | "searchText">) {
  return job.searchText?.trim() || job.description?.trim() || "";
}

function decodeJobId(id: string): DecodedJobId | null {
  const trimmed = id.trim();
  if (!trimmed.includes(":")) return null;

  const [source, encoded] = trimmed.split(":", 2);
  if (!source || !encoded) return null;

  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const parts = decoded.split("::").filter(Boolean);
    return {
      source: source as JobSource,
      parts,
    };
  } catch {
    return null;
  }
}

function normalizeSummaryJob(summary: Job): JobDetail {
  const descriptionText = readDescriptionText(summary);
  return {
    ...summary,
    remote: /remote/i.test(summary.location || ""),
    salaryText: summary.salary ?? null,
    applyUrl: summary.jobUrl ?? null,
    externalUrl: summary.jobUrl ?? null,
    contentHtml: looksLikeHtml(summary.description) ? summary.description ?? null : null,
    content: descriptionText || null,
    descriptionPlain: descriptionText || null,
    descriptionHtml: looksLikeHtml(summary.description) ? summary.description ?? null : null,
    summary: descriptionText || null,
    snippet: descriptionText || null,
    detailLevel: "summary",
    providerHasFullDetails: false,
    metadata: {
      source: summary.source,
    },
  };
}

function finalizeDetail(
  detail: JobDetail,
  options?: {
    fullDetailsUnavailable?: boolean;
  }
): ResolvedJobDetail {
  const descriptionForPretty =
    detail.descriptionHtml ||
    detail.descriptionPlain ||
    detail.description ||
    "";
  const pretty = prettyFromDescription(descriptionForPretty);

  return {
    job: {
      ...detail,
      salaryText: detail.salaryText ?? detail.salary ?? null,
      applyUrl: detail.applyUrl ?? detail.jobUrl ?? null,
      externalUrl: detail.externalUrl ?? detail.jobUrl ?? null,
      contentHtml: detail.contentHtml ?? detail.descriptionHtml ?? null,
      content:
        detail.content ??
        detail.descriptionPlain ??
        cleanPlainText(detail.description) ??
        null,
      summary:
        detail.summary ??
        detail.descriptionPlain ??
        cleanPlainText(detail.description) ??
        null,
      snippet:
        detail.snippet ??
        detail.descriptionPlain ??
        cleanPlainText(detail.description) ??
        null,
      sections: detail.sections ?? pretty.sections,
      detailLevel:
        detail.detailLevel ?? (options?.fullDetailsUnavailable ? "partial" : "full"),
      providerHasFullDetails:
        detail.providerHasFullDetails ?? !options?.fullDetailsUnavailable,
    },
    pretty,
    fullDetailsUnavailable: options?.fullDetailsUnavailable ?? false,
  };
}

async function fetchGreenhouseDetail(id: string, origin: string) {
  const res = await fetch(
    `${origin}/api/jobs/greenhouse/details?id=${encodeURIComponent(id)}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Failed to load Greenhouse details");
  }

  const data = (await res.json()) as {
    job: {
      id: string;
      source: "greenhouse";
      title: string;
      company: string;
      location: string;
      posted: string;
      jobUrl?: string;
      description?: string;
      fullDescriptionHtml?: string;
      department?: string | null;
      updatedAt?: string | null;
    };
  };

  return finalizeDetail({
    id: data.job.id,
    source: "greenhouse",
    title: data.job.title,
    company: data.job.company,
    location: data.job.location,
    posted: data.job.posted,
    jobUrl: data.job.jobUrl ?? undefined,
    applyUrl: data.job.jobUrl ?? null,
    externalUrl: data.job.jobUrl ?? null,
    description: data.job.description ?? "",
    descriptionHtml: data.job.fullDescriptionHtml ?? data.job.description ?? null,
    descriptionPlain: stripHtml(data.job.fullDescriptionHtml ?? data.job.description ?? ""),
    metadata: {
      department: data.job.department ?? null,
      updatedAt: data.job.updatedAt ?? null,
    },
    detailLevel: "full",
    providerHasFullDetails: true,
  });
}

async function fetchLeverDetail(id: string, summary?: Job | null) {
  const decoded = decodeJobId(id);
  const slug = decoded?.parts[0] ?? "";
  const jobId = decoded?.parts[1] ?? "";
  if (!slug || !jobId) {
    if (summary) return finalizeDetail(normalizeSummaryJob(summary), { fullDetailsUnavailable: true });
    throw new Error("Invalid Lever job id");
  }

  try {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}/${encodeURIComponent(jobId)}?mode=json`;
    const data = await fetchJson<LeverDetailResponse>(url, undefined, 2500);
    const sections =
      data.lists?.map((list) => ({
        title: cleanText(list.text, "Details"),
        kind: "paragraphs" as const,
        paragraphs: [stripHtml(list.content ?? "")].filter(Boolean),
      })) ?? [];

    const descriptionHtml = [
      data.description ?? "",
      ...(data.lists?.map((list) => {
        const content = list.content ?? "";
        if (!content) return "";
        const heading = cleanText(list.text);
        return heading
          ? `<section><h3>${escapeHtmlText(heading)}</h3>${content}</section>`
          : content;
      }) ?? []),
    ]
      .filter(Boolean)
      .join("\n");
    const descriptionPlain =
      cleanText(
        [data.descriptionPlain ?? "", ...sections.flatMap((section) => section.paragraphs ?? [])]
          .filter(Boolean)
          .join("\n\n")
      ) || null;

    return finalizeDetail({
      id,
      source: "lever",
      title: cleanText(data.text, summary?.title ?? "Untitled role"),
      company: summary?.company ?? humanizeSlug(slug),
      location: cleanText(data.categories?.location, summary?.location ?? "Remote"),
      posted: formatPostedLabel(data.createdAt ?? summary?.posted),
      salary: data.salaryDescription ?? summary?.salary,
      salaryText: data.salaryDescription ?? summary?.salary ?? null,
      employmentType: cleanText(data.categories?.commitment) || null,
      jobUrl: cleanText(data.hostedUrl, summary?.jobUrl ?? "") || summary?.jobUrl,
      applyUrl: cleanText(data.applyUrl, data.hostedUrl ?? summary?.jobUrl ?? "") || null,
      externalUrl: cleanText(data.hostedUrl, summary?.jobUrl ?? "") || null,
      description: descriptionPlain ?? summary?.description,
      descriptionHtml: looksLikeHtml(descriptionHtml) ? descriptionHtml : null,
      descriptionPlain,
      sections,
      requirements: sections
        .filter((section) => /qualification|requirement/i.test(section.title))
        .flatMap((section) => section.paragraphs ?? []),
      duties: sections
        .filter((section) => /responsibil|about the role|what you ll do|what you'll do/i.test(section.title))
        .flatMap((section) => section.paragraphs ?? []),
      metadata: {
        team: cleanText(data.categories?.team) || null,
        department: cleanText(data.categories?.department) || null,
      },
      detailLevel: sections.length > 0 || Boolean(descriptionPlain) ? "full" : "partial",
      providerHasFullDetails: sections.length > 0 || Boolean(descriptionPlain),
    }, {
      fullDetailsUnavailable: sections.length === 0 && !descriptionPlain,
    });
  } catch {
    if (!summary) throw new Error("Failed to load Lever details");
    return finalizeDetail(normalizeSummaryJob(summary), { fullDetailsUnavailable: true });
  }
}

function readAshbyLocation(value: string | { name?: string | null } | null | undefined) {
  if (typeof value === "string") return value;
  return value?.name ?? "";
}

async function fetchAshbyDetail(id: string, summary?: Job | null) {
  const decoded = decodeJobId(id);
  const slug = decoded?.parts[0] ?? "";
  const jobId = decoded?.parts[1] ?? "";
  if (!slug || !jobId) {
    if (summary) return finalizeDetail(normalizeSummaryJob(summary), { fullDetailsUnavailable: true });
    throw new Error("Invalid Ashby job id");
  }

  try {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}/job/${encodeURIComponent(jobId)}`;
    const response = await fetchJson<AshbyDetailResponse>(url);
    const detail = response.job ?? response;
    const descriptionHtml = detail.descriptionHtml ?? "";
    const descriptionPlain =
      cleanPlainText(detail.descriptionPlain) || stripHtml(descriptionHtml) || null;

    return finalizeDetail({
      id,
      source: "ashby",
      title: cleanText(detail.title, summary?.title ?? "Untitled role"),
      company: summary?.company ?? humanizeSlug(slug),
      location: cleanText(readAshbyLocation(detail.location), summary?.location ?? "Remote"),
      posted: formatPostedLabel(detail.publishedAt ?? summary?.posted),
      employmentType: cleanText(detail.employmentType) || null,
      jobUrl: cleanText(detail.applyUrl, summary?.jobUrl ?? "") || summary?.jobUrl,
      applyUrl: cleanText(detail.applyUrl, summary?.jobUrl ?? "") || null,
      externalUrl: cleanText(detail.applyUrl, summary?.jobUrl ?? "") || null,
      description: descriptionPlain ?? summary?.description,
      descriptionHtml: descriptionHtml || null,
      descriptionPlain,
      metadata: {
        team: cleanText(detail.teamName) || null,
        department: cleanText(detail.departmentName) || null,
      },
      detailLevel: descriptionHtml || descriptionPlain ? "full" : "partial",
      providerHasFullDetails: Boolean(descriptionHtml || descriptionPlain),
    }, {
      fullDetailsUnavailable: !descriptionHtml && !descriptionPlain,
    });
  } catch {
    if (!summary) throw new Error("Failed to load Ashby details");
    return finalizeDetail(normalizeSummaryJob(summary), { fullDetailsUnavailable: true });
  }
}

function readWorkableLocation(
  value: { city?: string; region?: string; country?: string } | null | undefined
) {
  const parts = [value?.city, value?.region, value?.country]
    .map((part) => cleanText(part))
    .filter(Boolean);
  return parts.join(", ");
}

async function fetchWorkableDetail(id: string, summary?: Job | null) {
  const decoded = decodeJobId(id);
  const slug = decoded?.parts[0] ?? "";
  const jobId = decoded?.parts[1] ?? "";
  if (!slug || !jobId) {
    if (summary) return finalizeDetail(normalizeSummaryJob(summary), { fullDetailsUnavailable: true });
    throw new Error("Invalid Workable job id");
  }

  try {
    const url = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(jobId)}`;
    const detail = await fetchJson<WorkableDetailResponse>(url);
    const descriptionHtml = detail.description ?? "";
    const descriptionPlain = stripHtml(descriptionHtml) || null;

    return finalizeDetail({
      id,
      source: "workable",
      title: cleanText(detail.title, summary?.title ?? "Untitled role"),
      company: summary?.company ?? humanizeSlug(slug),
      location: cleanText(readWorkableLocation(detail.location), summary?.location ?? "Remote"),
      posted: formatPostedLabel(detail.created_at ?? summary?.posted),
      employmentType: cleanText(detail.employment_type) || null,
      jobUrl: cleanText(detail.shortlink, summary?.jobUrl ?? "") || summary?.jobUrl,
      applyUrl: cleanText(detail.application_url, detail.shortlink ?? summary?.jobUrl ?? "") || null,
      externalUrl: cleanText(detail.shortlink, summary?.jobUrl ?? "") || null,
      description: descriptionPlain ?? summary?.description,
      descriptionHtml: descriptionHtml || null,
      descriptionPlain,
      detailLevel: descriptionHtml || descriptionPlain ? "full" : "partial",
      providerHasFullDetails: Boolean(descriptionHtml || descriptionPlain),
    }, {
      fullDetailsUnavailable: !descriptionHtml && !descriptionPlain,
    });
  } catch {
    if (!summary) throw new Error("Failed to load Workable details");
    return finalizeDetail(normalizeSummaryJob(summary), { fullDetailsUnavailable: true });
  }
}

async function fetchUSAJobsDetail(id: string, summary?: Job | null) {
  const decoded = decodeJobId(id);
  const providerId = decoded?.parts[0] ?? "";
  const key = process.env.USAJOBS_KEY;
  const email = process.env.USAJOBS_EMAIL;

  if (!providerId || !key || !email) {
    if (summary) return finalizeDetail(normalizeSummaryJob(summary), { fullDetailsUnavailable: true });
    throw new Error("USAJobs detail configuration missing");
  }

  try {
    const url = new URL("https://data.usajobs.gov/api/search");
    url.searchParams.set("JobID", providerId);

    const data = await fetchJson<USAJobsDetailResponse>(url.toString(), {
      headers: {
        "Authorization-Key": key,
        "User-Agent": email,
        Host: "data.usajobs.gov",
      },
    });

    const detail = data.SearchResult?.SearchResultItems?.[0]?.MatchedObjectDescriptor;
    const details = detail?.UserArea?.Details;
    if (!detail) {
      if (summary) return finalizeDetail(normalizeSummaryJob(summary), { fullDetailsUnavailable: true });
      throw new Error("USAJobs detail not found");
    }

    const summarySection = createParagraphSection("Summary", details?.JobSummary);
    const openToSection = createBulletSection(
      "This job is open to",
      details?.WhoMayApply,
      details?.HiringPath
    );
    const dutiesSection = createBulletSection("Duties", details?.MajorDuties);
    const requirementsSection = createBulletSection(
      "Requirements",
      details?.ConditionsOfEmployment,
      details?.KeyRequirements
    );
    const qualificationsSection = createParagraphSection(
      "Qualifications",
      details?.QualificationSummary,
      details?.Education
    );
    const additionalInformationSection = createParagraphSection(
      "Additional information",
      details?.AdditionalInformation,
      details?.OtherInformation,
      details?.WhatToExpectNext,
      details?.Relocation
    );
    const benefitsSection = createFlexibleSection("Benefits", details?.Benefits);
    const evaluationSection = createParagraphSection(
      "How you will be evaluated",
      details?.Evaluations
    );
    const requiredDocumentsSection = createBulletSection(
      "Required documents",
      details?.RequiredDocuments
    );
    const howToApplySection = createParagraphSection(
      "How to apply",
      details?.HowToApply
    );

    const sections = [
      summarySection,
      openToSection,
      dutiesSection,
      requirementsSection,
      qualificationsSection,
      additionalInformationSection,
      benefitsSection,
      evaluationSection,
      requiredDocumentsSection,
      howToApplySection,
    ].filter(Boolean) as JobDetailSection[];

    const duties = dutiesSection?.bullets ?? [];
    const requirements = requirementsSection?.bullets ?? [];
    const benefits =
      benefitsSection?.kind === "bullets"
        ? benefitsSection.bullets ?? []
        : benefitsSection?.paragraphs ?? [];
    const howToApply = howToApplySection?.paragraphs ?? [];
    const schedule = details?.PositionSchedule?.map((item) => cleanText(item.Name)).filter(Boolean) ?? [];
    const appointmentTypes =
      details?.PositionOfferingType?.map((item) => cleanText(item.Name)).filter(Boolean) ?? [];
    const salaryText =
      formatUsaJobsSalary(details?.Remuneration ?? detail.PositionRemuneration) ??
      summary?.salary ??
      null;
    const payGrade = [cleanText(details?.LowGrade), cleanText(details?.HighGrade)]
      .filter(Boolean)
      .join(" - ");
    const postedDate = formatCalendarDate(detail.PublicationStartDate);
    const closingDate = formatCalendarDate(detail.ApplicationCloseDate);
    const securityClearance = cleanPlainText(details?.SecurityClearance) || null;
    const travel = cleanPlainText(details?.TravelCode) || null;
    const telework =
      typeof details?.TeleworkEligible === "boolean"
        ? details.TeleworkEligible
          ? "Eligible"
          : "Not eligible"
        : cleanPlainText(details?.TeleworkEligible) || null;
    const categories =
      detail.JobCategory?.map((item) => cleanText(item.Name)).filter(Boolean) ?? [];
    const employmentType = [...schedule, ...appointmentTypes].filter(Boolean).join(", ");
    const metadataItems = [
      { label: "Source", value: "USAJobs" },
      ...(salaryText ? [{ label: "Salary", value: salaryText }] : []),
      ...(payGrade ? [{ label: "Pay grade", value: payGrade }] : []),
      ...(employmentType ? [{ label: "Employment type", value: employmentType }] : []),
      ...(postedDate ? [{ label: "Posted", value: postedDate }] : []),
      ...(closingDate ? [{ label: "Closes", value: closingDate }] : []),
      ...(securityClearance
        ? [{ label: "Security clearance", value: securityClearance }]
        : []),
      ...(travel ? [{ label: "Travel", value: travel }] : []),
      ...(telework ? [{ label: "Telework", value: telework }] : []),
      ...(categories.length
        ? [{ label: "Category", value: categories.join(", ") }]
        : []),
    ];
    const descriptionHtml = buildUsaJobsDetailHtml({
      metadataItems,
      sections,
    });
    const descriptionPlain = sections
      .flatMap((section) => {
        if (section.kind === "bullets") {
          return [
            section.title,
            ...(section.bullets ?? []).map((bullet) => `- ${bullet}`),
          ];
        }

        if (section.kind === "paragraphs" || section.kind === "smallprint") {
          return [section.title, ...(section.paragraphs ?? [])];
        }

        if (section.kind === "callout" && section.callout) {
          return [
            section.title,
            section.callout.label
              ? `${section.callout.label}: ${section.callout.value}`
              : section.callout.value,
          ];
        }

        return [];
      })
      .join("\n\n");

    return finalizeDetail({
      id,
      source: "usajobs",
      title: cleanText(detail.PositionTitle, summary?.title ?? "Untitled role"),
      company: cleanText(detail.OrganizationName, summary?.company ?? "USAJobs"),
      location: cleanText(detail.PositionLocationDisplay, summary?.location ?? "United States"),
      posted: formatPostedLabel(detail.PublicationStartDate ?? summary?.posted),
      salary: salaryText ?? undefined,
      salaryText,
      employmentType: employmentType || null,
      remote: Boolean(telework && /eligible|remote|telework/i.test(telework)),
      jobUrl: cleanText(detail.PositionURI, summary?.jobUrl ?? "") || summary?.jobUrl,
      applyUrl: cleanText(detail.PositionURI, summary?.jobUrl ?? "") || null,
      externalUrl: cleanText(detail.PositionURI, summary?.jobUrl ?? "") || null,
      description: cleanPlainText(details?.JobSummary) || summary?.description,
      descriptionHtml: descriptionHtml || null,
      descriptionPlain: descriptionPlain || cleanPlainText(details?.JobSummary) || null,
      sections,
      requirements,
      duties,
      benefits,
      howToApply,
      metadata: {
        schedule: schedule.join(", ") || null,
        postedDate: postedDate ?? null,
        closingDate: closingDate ?? null,
        payGrade: payGrade || null,
        securityClearance,
        travel,
        telework,
        category: categories.join(", ") || null,
        minimumSalary: details?.Remuneration?.[0]?.MinimumRange ?? null,
        maximumSalary: details?.Remuneration?.[0]?.MaximumRange ?? null,
      },
      detailLevel: sections.length > 0 ? "full" : "partial",
      providerHasFullDetails: sections.length > 0,
    }, {
      fullDetailsUnavailable: sections.length === 0,
    });
  } catch {
    if (!summary) throw new Error("Failed to load USAJobs details");
    return finalizeDetail(normalizeSummaryJob(summary), { fullDetailsUnavailable: true });
  }
}

async function fetchRemotiveDetail(id: string, summary?: Job | null) {
  const decoded = decodeJobId(id);
  const providerId = decoded?.parts[0] ?? "";
  try {
    const data = await fetchJson<RemotiveApiResponse>("https://remotive.com/api/remote-jobs");
    const job = (data.jobs ?? []).find((item) => String(item.id ?? "") === providerId);
    if (!job) throw new Error("Remotive job not found");

    const descriptionHtml = looksLikeHtml(job.description) ? job.description ?? null : null;
    const descriptionPlain =
      cleanPlainText(job.description) || summary?.description || null;

    return finalizeDetail({
      id,
      source: "remotive",
      title: cleanText(job.title, summary?.title ?? "Untitled role"),
      company: cleanText(job.company_name, summary?.company ?? "Remotive Company"),
      location: cleanText(
        job.candidate_required_location,
        summary?.location ?? "Remote"
      ),
      posted: formatPostedLabel(job.publication_date ?? summary?.posted),
      salary: cleanText(job.salary) || summary?.salary || undefined,
      salaryText: cleanText(job.salary) || summary?.salary || null,
      employmentType: cleanText(job.job_type) || null,
      jobUrl: cleanText(job.url, summary?.jobUrl ?? "") || summary?.jobUrl,
      applyUrl: cleanText(job.url, summary?.jobUrl ?? "") || summary?.jobUrl || null,
      externalUrl: cleanText(job.url, summary?.jobUrl ?? "") || summary?.jobUrl || null,
      description: descriptionPlain ?? summary?.description,
      descriptionHtml,
      descriptionPlain,
      detailLevel: descriptionHtml || descriptionPlain ? "full" : "partial",
      providerHasFullDetails: Boolean(descriptionHtml || descriptionPlain),
    }, {
      fullDetailsUnavailable: !descriptionHtml && !descriptionPlain,
    });
  } catch {
    if (!summary) throw new Error("Failed to load Remotive details");
    return finalizeDetail(normalizeSummaryJob(summary), { fullDetailsUnavailable: true });
  }
}

async function fetchRemoteOkDetail(id: string, summary?: Job | null) {
  const decoded = decodeJobId(id);
  const providerId = decoded?.parts[0] ?? "";
  try {
    const data = await fetchJson<Array<RemoteOkApiJob | Record<string, unknown>>>(
      "https://remoteok.com/api"
    );
    const rows = Array.isArray(data) ? data.slice(1) : [];
    const job = rows.find((item) => String((item as RemoteOkApiJob).id ?? "") === providerId) as
      | RemoteOkApiJob
      | undefined;

    if (!job) throw new Error("RemoteOK job not found");

    const salaryText =
      job.salary_min || job.salary_max
        ? `${job.salary_min ? `$${Math.round(job.salary_min).toLocaleString()}` : ""}${
            job.salary_min && job.salary_max ? " - " : ""
          }${job.salary_max ? `$${Math.round(job.salary_max).toLocaleString()}` : ""}`
        : null;
    const descriptionHtml = looksLikeHtml(job.description) ? job.description ?? null : null;
    const descriptionPlain =
      cleanPlainText(job.description) || summary?.description || null;

    return finalizeDetail({
      id,
      source: "remoteok",
      title: cleanText(job.position, summary?.title ?? "Untitled role"),
      company: cleanText(job.company, summary?.company ?? "RemoteOK Company"),
      location: cleanText(job.location, summary?.location ?? "Remote"),
      posted: formatPostedLabel(job.date ?? summary?.posted),
      salaryText,
      salaryMin: job.salary_min ?? null,
      salaryMax: job.salary_max ?? null,
      jobUrl: cleanText(job.url, summary?.jobUrl ?? "") || summary?.jobUrl,
      applyUrl: cleanText(job.url, summary?.jobUrl ?? "") || summary?.jobUrl || null,
      externalUrl: cleanText(job.url, summary?.jobUrl ?? "") || summary?.jobUrl || null,
      description: descriptionPlain ?? summary?.description,
      descriptionHtml,
      descriptionPlain,
      benefits: job.tags?.map((tag) => cleanText(tag)).filter(Boolean) ?? [],
      detailLevel: descriptionHtml || descriptionPlain ? "full" : "partial",
      providerHasFullDetails: Boolean(descriptionHtml || descriptionPlain),
    }, {
      fullDetailsUnavailable: !descriptionHtml && !descriptionPlain,
    });
  } catch {
    if (!summary) throw new Error("Failed to load RemoteOK details");
    return finalizeDetail(normalizeSummaryJob(summary), { fullDetailsUnavailable: true });
  }
}

async function fetchAdzunaDetail(id: string, origin: string, summary?: Job | null) {
  try {
    const job = await fetchAdzunaJobDetails(id, origin);
    if (!job) {
      if (summary) return finalizeDetail(normalizeSummaryJob(summary), { fullDetailsUnavailable: true });
      throw new Error("Adzuna job not found");
    }

    return finalizeDetail({
      ...normalizeSummaryJob(summary ?? job),
      ...job,
      detailLevel: job.descriptionHtml || job.description ? "partial" : "summary",
      providerHasFullDetails: Boolean(job.descriptionHtml || job.description),
    }, {
      fullDetailsUnavailable: !job.descriptionHtml && !job.description,
    });
  } catch {
    if (!summary) throw new Error("Failed to load Adzuna details");
    return finalizeDetail(normalizeSummaryJob(summary), { fullDetailsUnavailable: true });
  }
}

export async function resolveJobDetail(args: ResolveJobDetailArgs): Promise<ResolvedJobDetail> {
  const { id, origin, summary } = args;
  const source = (summary?.source ?? id.split(":")[0]) as JobSource;

  switch (source) {
    case "greenhouse":
      return fetchGreenhouseDetail(id, origin);
    case "adzuna":
      return fetchAdzunaDetail(id, origin, summary);
    case "lever":
      return fetchLeverDetail(id, summary);
    case "ashby":
      return fetchAshbyDetail(id, summary);
    case "workable":
      return fetchWorkableDetail(id, summary);
    case "usajobs":
      return fetchUSAJobsDetail(id, summary);
    case "remotive":
      return fetchRemotiveDetail(id, summary);
    case "remoteok":
      return fetchRemoteOkDetail(id, summary);
    default:
      if (!summary) {
        throw new Error(`Details are not supported for source: ${source}`);
      }
      return finalizeDetail(normalizeSummaryJob(summary), {
        fullDetailsUnavailable: true,
      });
  }
}
