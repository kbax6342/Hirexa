import "server-only";

import { NextResponse } from "next/server";

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

const FOOTER_TEXT_PATTERN =
  /\n\n(Jobseekers|Recruiters|Adzuna|Country selection|Terms(?:\s*&\s*Conditions|\s+and\s+Conditions)|Privacy Policy|Cookie Policy|\u00A9|&copy;|&#169;)\b/i;

const FOOTER_HTML_PATTERN =
  /(Jobseekers|Recruiters|Country selection|Terms(?:\s*&\s*Conditions|\s+and\s+Conditions)|Privacy Policy|Cookie Policy|Adzuna|&copy;|&#169;|\u00A9)/i;

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
      // Ignore malformed blocks.
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
      ...asStringArray(jobPosting.jobLocationType),
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

function readRemoteLabel(jobPosting: JsonLdNode | null) {
  const locationType = cleanText(asString(jobPosting?.jobLocationType));
  if (/remote|telecommute/i.test(locationType)) {
    return "Remote";
  }

  return "";
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

function readJobPostingUrl(jobPosting: JsonLdNode | null, fallbackUrl: string) {
  if (!jobPosting) return fallbackUrl;
  const url = cleanText(asString(jobPosting.url));
  return url || fallbackUrl;
}

function trimDescriptionText(value: string) {
  const trimmed = cleanText(value);
  if (!trimmed) return "";

  const parts = trimmed.split(FOOTER_TEXT_PATTERN);
  return cleanText(parts[0] ?? trimmed);
}

function sanitizeHtmlChunk(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .trim();
}

function uniqueByNormalizedText(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = trimDescriptionText(stripHtml(value));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function extractDescriptionHtmlCandidates(html: string, jobPosting: JsonLdNode | null) {
  const candidates: string[] = [];

  const jsonLdDescription = asString(jobPosting?.description).trim();
  if (/<[^>]+>/.test(jsonLdDescription)) {
    candidates.push(jsonLdDescription);
  }

  for (const pattern of DESCRIPTION_SECTION_MARKERS) {
    const markerIndex = html.search(pattern);
    if (markerIndex === -1) continue;

    const slice = html.slice(Math.max(0, markerIndex - 200), markerIndex + 120000);
    const footerIndex = slice.search(FOOTER_HTML_PATTERN);
    const chunk = sanitizeHtmlChunk(
      footerIndex === -1 ? slice : slice.slice(0, footerIndex)
    );

    if (trimDescriptionText(stripHtml(chunk)).length > 180) {
      candidates.push(chunk);
    }
  }

  const mainMatch = html.match(/<(main|article)[^>]*>([\s\S]{600,140000}?)<\/\1>/i);
  if (mainMatch?.[2]) {
    const chunk = sanitizeHtmlChunk(mainMatch[2]);
    if (trimDescriptionText(stripHtml(chunk)).length > 180) {
      candidates.push(chunk);
    }
  }

  return uniqueByNormalizedText(candidates);
}

function removeDuplicatedHeaderText(params: {
  text: string;
  title?: string;
  company?: string;
  location?: string;
}) {
  const blocks = params.text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const dedupeTargets = [params.title, params.company, params.location]
    .map((value) => normalizeCompare(value))
    .filter(Boolean);

  while (blocks.length > 1) {
    const firstBlock = normalizeCompare(blocks[0]);
    if (!firstBlock) {
      blocks.shift();
      continue;
    }

    const looksDuplicative = dedupeTargets.some(
      (target) =>
        firstBlock === target ||
        firstBlock.includes(target) ||
        target.includes(firstBlock)
    );

    if (!looksDuplicative) {
      break;
    }

    blocks.shift();
  }

  return blocks.join("\n\n");
}

function renderPlainTextAsHtml(text: string) {
  const lines = cleanText(text).split("\n");
  const blocks: string[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    blocks.push(
      `<p>${paragraphLines.map((line) => escapeHtml(line)).join("<br />")}</p>`
    );
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (!listType || !listItems.length) return;
    blocks.push(
      `<${listType}>${listItems
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</${listType}>`
    );
    listItems.length = 0;
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const unorderedMatch = line.match(/^[-*\u2022]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(unorderedMatch[1]);
      continue;
    }

    const orderedMatch = line.match(/^\d+[\.\)]\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(orderedMatch[1]);
      continue;
    }

    flushList();

    if (
      /^(description|job description|overview|position overview|responsibilities|requirements|qualifications|benefits|how to apply|summary|about the role|about the team):?$/i.test(
        line
      )
    ) {
      flushParagraph();
      blocks.push(`<h3>${escapeHtml(line.replace(/:$/, ""))}</h3>`);
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks.join("\n");
}

function selectBestDescription(params: {
  html: string;
  jobPosting: JsonLdNode | null;
  title: string;
  company: string;
  location: string;
}) {
  const htmlCandidates = extractDescriptionHtmlCandidates(
    params.html,
    params.jobPosting
  );

  const textCandidates = [
    trimDescriptionText(stripHtml(asString(params.jobPosting?.description))),
    ...htmlCandidates.map((candidate) => trimDescriptionText(stripHtml(candidate))),
    trimDescriptionText(stripHtml(params.html)),
  ]
    .map((candidate) =>
      removeDuplicatedHeaderText({
        text: candidate,
        title: params.title,
        company: params.company,
        location: params.location,
      })
    )
    .filter((candidate) => candidate.length > 80)
    .sort((a, b) => b.length - a.length);

  const descriptionText = textCandidates[0] ?? "";

  const richHtmlCandidates = htmlCandidates
    .map((candidate) => {
      const candidateText = removeDuplicatedHeaderText({
        text: trimDescriptionText(stripHtml(candidate)),
        title: params.title,
        company: params.company,
        location: params.location,
      });

      return {
        html: candidate,
        text: candidateText,
      };
    })
    .filter((candidate) => candidate.text.length > 120)
    .sort((a, b) => b.text.length - a.text.length);

  let descriptionHtml = richHtmlCandidates[0]?.html ?? "";
  const htmlTextLength = richHtmlCandidates[0]?.text.length ?? 0;

  if (
    descriptionText &&
    (!descriptionHtml ||
      (htmlTextLength > 0 &&
        htmlTextLength < Math.min(descriptionText.length * 0.6, descriptionText.length - 250)))
  ) {
    descriptionHtml = renderPlainTextAsHtml(descriptionText);
  }

  return {
    descriptionText,
    descriptionHtml,
  };
}

function buildRichDescriptionHtml(params: {
  descriptionHtml: string;
  descriptionText: string;
  salaryText: string;
  employmentType: string;
  category: string;
  postedLabel: string;
  remote: string;
}) {
  const metadataItems = [
    { label: "Source", value: "Adzuna" },
    { label: "Posted", value: params.postedLabel },
    { label: "Salary", value: params.salaryText },
    { label: "Employment Type", value: params.employmentType },
    { label: "Category", value: params.category },
    { label: "Remote", value: params.remote },
  ].filter((item) => item.value);

  const metadataHtml =
    metadataItems.length > 0
      ? `<section><h3>Role Snapshot</h3><ul>${metadataItems
          .map(
            (item) =>
              `<li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</li>`
          )
          .join("")}</ul></section>`
      : "";

  const descriptionBody = params.descriptionHtml
    ? `<section><h3>Job Description</h3>${params.descriptionHtml}</section>`
    : params.descriptionText
      ? `<section><h3>Job Description</h3>${renderPlainTextAsHtml(params.descriptionText)}</section>`
      : "";

  return [metadataHtml, descriptionBody].filter(Boolean).join("\n");
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
    const salaryInfo = readSalaryInfo(jobPosting?.baseSalary);
    const employmentType = readJobPostingEmploymentType(jobPosting);
    const category = readJobPostingCategory(jobPosting);
    const remote = readRemoteLabel(jobPosting);
    const jobUrl = readJobPostingUrl(jobPosting, detailsUrl);

    const { descriptionText, descriptionHtml } = selectBestDescription({
      html,
      jobPosting,
      title,
      company,
      location,
    });

    const richDescriptionHtml = buildRichDescriptionHtml({
      descriptionHtml,
      descriptionText,
      salaryText: salaryInfo.text,
      employmentType,
      category,
      postedLabel,
      remote,
    });

    return NextResponse.json({
      id,
      source: "adzuna",
      title,
      company,
      companyName: company,
      location,
      posted: posted || "",
      postedLabel: postedLabel || "",
      salary: salaryInfo.text || null,
      salaryText: salaryInfo.text || null,
      salaryMin: salaryInfo.min,
      salaryMax: salaryInfo.max,
      compensation: salaryInfo.text || null,
      employmentType: employmentType || null,
      schedule: employmentType || null,
      category: category || null,
      remote: remote || null,
      jobUrl,
      applyUrl: jobUrl,
      externalUrl: jobUrl,
      url: jobUrl,
      detailsUrl,
      description: descriptionText,
      descriptionText: descriptionText,
      content: descriptionText || null,
      contentHtml: richDescriptionHtml || null,
      descriptionHtml: richDescriptionHtml || null,
      summary: descriptionText || null,
      snippet: descriptionText || null,
      metadata: {
        source: "Adzuna",
        postedLabel: postedLabel || null,
        salaryText: salaryInfo.text || null,
        employmentType: employmentType || null,
        category: category || null,
        remote: remote || null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADZUNA_DETAILS] failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
