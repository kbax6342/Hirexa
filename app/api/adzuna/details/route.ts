import "server-only";

import { NextResponse } from "next/server";

import {
  buildAdzunaStructuredHtml,
  splitAdzunaSections,
} from "@/app/lib/jobs/adzunaStructuredDetail";
import { cleanJobText } from "@/app/lib/jobs/clean-job-text";
import { formatAdzunaDescription } from "@/app/lib/jobs/formatAdzunaDescription";

type JsonLdNode = Record<string, unknown>;

type SalaryInfo = {
  text: string;
  min: number | null;
  max: number | null;
};

const DESCRIPTION_SECTION_MARKERS = [
  />\s*Job Description\s*</i,
  />\s*Description\s*</i,
  />\s*Position Overview\s*</i,
  />\s*Overview\s*</i,
  />\s*Responsibilities\s*</i,
  />\s*Requirements\s*</i,
  />\s*Qualifications\s*</i,
  />\s*About the Role\s*</i,
  />\s*About the Team\s*</i,
];

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(value: string) {
  return decodeHtml(
    value
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

function stripHtml(html: string) {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(
        /<\/(p|div|br|li|h1|h2|h3|h4|h5|h6|section|article|main|ul|ol)>/gi,
        "\n"
      )
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " ")
  );
}

function normalizeCompare(value: string | null | undefined) {
  return cleanText(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => asStringArray(item));
  }

  const text = asString(value).trim();
  return text ? [text] : [];
}

function flattenJsonLd(value: unknown): JsonLdNode[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenJsonLd(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const node = value as JsonLdNode;
  return [node, ...flattenJsonLd(node["@graph"])];
}

function hasJsonLdType(node: JsonLdNode, typeName: string) {
  return asStringArray(node["@type"]).some(
    (value) => value.toLowerCase() === typeName.toLowerCase()
  );
}

function extractJobPostingJsonLd(html: string) {
  const matches = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const nodes = flattenJsonLd(parsed);
      const jobPosting = nodes.find((node) => hasJsonLdType(node, "JobPosting"));
      if (jobPosting) return jobPosting;
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return null;
}

function extractTitle(html: string) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) {
    return stripHtml(h1[1]);
  }

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title?.[1]) {
    return stripHtml(title[1]).replace(/\s*\|\s*Adzuna\s*$/i, "");
  }

  return "";
}

function extractLocationFromText(titleText: string) {
  const match = titleText.match(/Job in\s+(.+?)\s*$/i);
  return match?.[1]?.trim() ?? "";
}

function readJobPostingCompany(jobPosting: JsonLdNode | null) {
  if (!jobPosting) return "";

  const hiringOrganization = jobPosting.hiringOrganization;
  if (hiringOrganization && typeof hiringOrganization === "object") {
    return cleanText(asString((hiringOrganization as JsonLdNode).name));
  }

  return "";
}

function readJobPostingLocation(jobPosting: JsonLdNode | null) {
  if (!jobPosting) return "";

  const locations = Array.isArray(jobPosting.jobLocation)
    ? jobPosting.jobLocation
    : jobPosting.jobLocation
      ? [jobPosting.jobLocation]
      : [];

  for (const location of locations) {
    if (!location || typeof location !== "object") continue;

    const node = location as JsonLdNode;
    const address =
      node.address && typeof node.address === "object"
        ? (node.address as JsonLdNode)
        : null;

    const parts = [
      address ? asString(address.addressLocality) : "",
      address ? asString(address.addressRegion) : "",
      address ? asString(address.addressCountry) : "",
    ]
      .map((value) => cleanText(value))
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join(", ");
    }
  }

  return cleanText(asString(jobPosting.jobLocationType));
}

function readJobPostingEmploymentType(jobPosting: JsonLdNode | null) {
  if (!jobPosting) return "";
  return cleanText(asStringArray(jobPosting.employmentType).join(", "));
}

function readJobPostingCategory(jobPosting: JsonLdNode | null) {
  if (!jobPosting) return "";

  return cleanText(
    [
      ...asStringArray(jobPosting.occupationalCategory),
      ...asStringArray(jobPosting.industry),
    ].join(", ")
  );
}

function readJobPostingDate(jobPosting: JsonLdNode | null) {
  if (!jobPosting) return "";
  return cleanText(asString(jobPosting.datePosted));
}

function formatPostedLabel(dateValue: string) {
  if (!dateValue) return "";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return cleanText(dateValue);
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isPredictedSalary(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function readSalaryInfo(baseSalary: unknown): SalaryInfo {
  if (!baseSalary || typeof baseSalary !== "object") {
    return {
      text: "",
      min: null,
      max: null,
    };
  }

  const node = baseSalary as JsonLdNode;
  const currency = asString(node.currency) || "USD";
  const unitText = cleanText(
    asString(node.unitText) ||
      (node.value && typeof node.value === "object"
        ? asString((node.value as JsonLdNode).unitText)
        : "")
  );

  const valueNode =
    node.value && typeof node.value === "object" ? (node.value as JsonLdNode) : node;
  const minValue = Number(valueNode.minValue ?? valueNode.value ?? NaN);
  const maxValue = Number(valueNode.maxValue ?? NaN);

  if (!Number.isFinite(minValue) && !Number.isFinite(maxValue)) {
    return {
      text: "",
      min: null,
      max: null,
    };
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  const formattedMin = Number.isFinite(minValue) ? formatter.format(minValue) : "";
  const formattedMax = Number.isFinite(maxValue) ? formatter.format(maxValue) : "";
  const unitSuffix = unitText ? ` / ${unitText}` : "";

  if (formattedMin && formattedMax) {
    if (Math.round(minValue) === Math.round(maxValue)) {
      return {
        text: `${formattedMin}${unitSuffix}`,
        min: minValue,
        max: maxValue,
      };
    }

    return {
      text: `${formattedMin} - ${formattedMax}${unitSuffix}`,
      min: minValue,
      max: maxValue,
    };
  }

  if (formattedMin) {
    return {
      text: `From ${formattedMin}${unitSuffix}`,
      min: minValue,
      max: Number.isFinite(maxValue) ? maxValue : null,
    };
  }

  return {
    text: `Up to ${formattedMax}${unitSuffix}`,
    min: Number.isFinite(minValue) ? minValue : null,
    max: maxValue,
  };
}

function readSalaryIsEstimated(html: string, jobPosting: JsonLdNode | null) {
  if (isPredictedSalary(jobPosting?.salary_is_predicted)) {
    return true;
  }

  return (
    /salary_is_predicted["']?\s*[:=]\s*(?:true|1)/i.test(html) ||
    /\bestimated salary\b/i.test(html)
  );
}

function formatSalaryText(text: string, estimated: boolean) {
  const cleaned = cleanText(text);
  if (!cleaned) return "";
  return estimated ? `${cleaned} - estimated` : cleaned;
}

function readJobPostingUrl(jobPosting: JsonLdNode | null, fallbackUrl: string) {
  if (!jobPosting) return fallbackUrl;
  const url = cleanText(asString(jobPosting.url));
  return url || fallbackUrl;
}

function extractDescriptionCandidates(html: string, jobPosting: JsonLdNode | null) {
  const candidates: string[] = [];

  const jsonLdDescription = stripHtml(asString(jobPosting?.description));
  if (jsonLdDescription.length > 80) {
    candidates.push(jsonLdDescription);
  }

  for (const pattern of DESCRIPTION_SECTION_MARKERS) {
    const markerIndex = html.search(pattern);
    if (markerIndex === -1) continue;
    const chunk = stripHtml(html.slice(Math.max(0, markerIndex - 200), markerIndex + 80000));
    if (chunk.length > 80) {
      candidates.push(chunk);
    }
  }

  const mainMatch = html.match(/<(main|article)[^>]*>([\s\S]{600,120000}?)<\/\1>/i);
  if (mainMatch?.[2]) {
    const chunk = stripHtml(mainMatch[2]);
    if (chunk.length > 80) {
      candidates.push(chunk);
    }
  }

  const fullText = stripHtml(html);
  if (fullText.length > 80) {
    candidates.push(fullText);
  }

  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const candidate of candidates) {
    const cleanedCandidate = cleanJobText(candidate, { source: "adzuna" });
    const key = normalizeCompare(cleanedCandidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(cleanedCandidate);
  }

  return deduped;
}

function scoreStructuredContent(params: {
  descriptionIntro: string[];
  responsibilities: string[];
  qualifications: string[];
  description: string;
}) {
  return (
    params.descriptionIntro.join(" ").length +
    params.description.length +
    params.responsibilities.length * 120 +
    params.qualifications.length * 120
  );
}

function findSectionBullets(
  sections: Array<{ title: string; bullets?: string[]; paragraphs?: string[] }>,
  pattern: RegExp
) {
  return sections
    .filter((section) => pattern.test(section.title))
    .flatMap((section) => section.bullets ?? [])
    .filter(Boolean);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const detailsUrl = `https://www.adzuna.com/details/${encodeURIComponent(id)}`;

    const res = await fetch(detailsUrl, {
      cache: "no-store",
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        {
          error: `Failed to fetch Adzuna details page (${res.status})`,
          snippet: text.slice(0, 200),
        },
        { status: 404 }
      );
    }

    const html = await res.text();
    const jobPosting = extractJobPostingJsonLd(html);

    const title =
      cleanText(asString(jobPosting?.title)) ||
      extractTitle(html) ||
      "Untitled role";
    const company = readJobPostingCompany(jobPosting) || "Unknown company";
    const location =
      readJobPostingLocation(jobPosting) ||
      extractLocationFromText(title) ||
      "Unknown location";
    const posted = readJobPostingDate(jobPosting);
    const postedLabel = formatPostedLabel(posted);
    const employmentType = readJobPostingEmploymentType(jobPosting);
    const category = readJobPostingCategory(jobPosting);
    const salaryInfo = readSalaryInfo(jobPosting?.baseSalary);
    const salaryIsEstimated = readSalaryIsEstimated(html, jobPosting);
    const salaryText = formatSalaryText(salaryInfo.text, salaryIsEstimated);
    const jobUrl = readJobPostingUrl(jobPosting, detailsUrl);

    const descriptionCandidates = extractDescriptionCandidates(html, jobPosting);
    const structuredCandidates = descriptionCandidates
      .map((candidate) => ({
        raw: candidate,
        structured: splitAdzunaSections(candidate, {
          title,
          company,
          location,
          salary: salaryText,
        }),
      }))
      .filter(
        ({ structured }) =>
          structured.description.length > 0 ||
          structured.descriptionIntro.length > 0 ||
          structured.responsibilities.length > 0 ||
          structured.qualifications.length > 0
      )
      .sort(
        (left, right) =>
          scoreStructuredContent(right.structured) -
          scoreStructuredContent(left.structured)
      );

    const structured =
      structuredCandidates[0]?.structured ?? {
        descriptionIntro: [],
        responsibilities: [],
        qualifications: [],
        description: "",
      };

    const structuredHtml = buildAdzunaStructuredHtml(structured);
    const fallbackDescription =
      structured.description ||
      structured.descriptionIntro.join("\n\n") ||
      descriptionCandidates[0] ||
      "";
    const cleanedFallbackDescription = cleanJobText(
      fallbackDescription || descriptionCandidates[0] || "",
      { source: "adzuna" }
    );
    const formatted = formatAdzunaDescription(
      cleanedFallbackDescription || descriptionCandidates[0] || ""
    );
    const resolvedSalaryText =
      salaryText ||
      formatSalaryText(formatted?.compensation ?? "", salaryIsEstimated);
    const resolvedIntro =
      structured.descriptionIntro.length > 0
        ? structured.descriptionIntro
        : formatted?.intro ?? [];
    const resolvedSections =
      formatted?.sections.map((section) => ({
        title: section.title,
        kind: section.bullets?.length ? "bullets" : "paragraphs",
        paragraphs: section.paragraphs ?? [],
        bullets: section.bullets ?? [],
      })) ?? [];
    const resolvedResponsibilities =
      structured.responsibilities.length > 0
        ? structured.responsibilities
        : findSectionBullets(resolvedSections, /responsibilities|what you'll do/i);
    const resolvedQualifications =
      structured.qualifications.length > 0
        ? structured.qualifications
        : findSectionBullets(
            resolvedSections,
            /requirements|qualifications|what we're looking for/i
          );
    const resolvedEmploymentType =
      employmentType || formatted?.employmentType || "";
    const resolvedSchedule =
      formatted?.schedule || resolvedEmploymentType || "";
    const rawDescription =
      formatted?.rawDescription || cleanedFallbackDescription || "";

    return NextResponse.json({
      id,
      source: "Adzuna",
      title,
      company,
      companyName: company,
      location,
      posted: posted || "",
      postedLabel: postedLabel || "",
      salary: resolvedSalaryText || null,
      salaryText: resolvedSalaryText || null,
      salaryMin: salaryInfo.min,
      salaryMax: salaryInfo.max,
      salaryIsEstimated,
      compensation: resolvedSalaryText || null,
      employmentType: resolvedEmploymentType || null,
      schedule: resolvedSchedule || null,
      category: category || null,
      descriptionIntro: resolvedIntro,
      responsibilities: resolvedResponsibilities,
      qualifications: resolvedQualifications,
      sections: resolvedSections,
      description: cleanedFallbackDescription,
      descriptionText: cleanedFallbackDescription,
      content: rawDescription || null,
      contentHtml: structuredHtml || null,
      descriptionHtml: structuredHtml || null,
      summary: rawDescription || null,
      snippet: rawDescription || null,
      rawDescription: rawDescription || null,
      jobUrl,
      applyUrl: jobUrl,
      externalUrl: jobUrl,
      url: jobUrl,
      detailsUrl,
      metadata: {
        source: "Adzuna",
        postedLabel: postedLabel || null,
        salaryText: resolvedSalaryText || null,
        salaryIsEstimated,
        employmentType: resolvedEmploymentType || null,
        schedule: resolvedSchedule || null,
        category: category || null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADZUNA_DETAILS] failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
