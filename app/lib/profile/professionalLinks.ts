export type ProfessionalLinkSource = "auto" | "custom";

export type ProfessionalLink = {
  id: string;
  url: string;
  label: string;
  source?: ProfessionalLinkSource;
};

type InferProfessionalLinkLabelOptions = {
  aiFallback?: (url: string) => Promise<string | null | undefined>;
};

const KNOWN_DOMAIN_LABELS = [
  ["linkedin.com", "LinkedIn"],
  ["github.com", "GitHub"],
  ["gitlab.com", "GitLab"],
  ["twitter.com", "X"],
  ["x.com", "X"],
  ["youtube.com", "YouTube"],
  ["behance.net", "Behance"],
  ["dribbble.com", "Dribbble"],
  ["medium.com", "Medium"],
  ["dev.to", "Dev.to"],
  ["substack.com", "Substack"],
  ["notion.so", "Notion"],
  ["notion.site", "Notion"],
  ["calendly.com", "Calendly"],
  ["figma.com", "Figma"],
  ["linktr.ee", "Linktree"],
  ["resume.io", "Resume"],
].map(([domain, label]) => ({ domain, label }));

function createProfessionalLinkId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `link_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeProfessionalLinkLabelText(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ");

  return normalized.slice(0, 40);
}

function hostnameWithoutWww(hostname: string) {
  return hostname.replace(/^www\d*\./i, "");
}

function hostnameRoot(hostname: string) {
  return hostnameWithoutWww(hostname.toLowerCase()).split(".")[0] ?? "";
}

function titleCaseLabel(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getKnownDomainLabel(hostname: string) {
  const cleanHostname = hostnameWithoutWww(hostname.toLowerCase());
  const match = KNOWN_DOMAIN_LABELS.find(
    ({ domain }) => cleanHostname === domain || cleanHostname.endsWith(`.${domain}`)
  );

  return match?.label ?? null;
}

function getHeuristicProfessionalLinkLabel(url: URL) {
  const host = hostnameWithoutWww(url.hostname.toLowerCase());
  const path = `${url.pathname}${url.search}`.toLowerCase();
  const combined = `${host}${path}`;
  const root = hostnameRoot(host);
  const topLevelDomain = host.split(".").pop() ?? "";

  if (/\b(portfolio|projects|work|case-study|case-studies)\b/.test(combined)) {
    return "Portfolio";
  }

  if (/\b(resume|cv)\b/.test(combined)) {
    return "Resume";
  }

  if (/\b(blog|posts|articles|writing|journal|newsletter)\b/.test(combined)) {
    return "Blog";
  }

  if (
    !getKnownDomainLabel(host) &&
    (/[._-]/.test(root) ||
      ["me", "design", "dev", "page", "site"].includes(topLevelDomain) ||
      /(studio|design|creative|dev|engineer|writer|portfolio|works?)$/i.test(root))
  ) {
    return "Personal Website";
  }

  return null;
}

function cleanedHostnameLabelFromUrl(url: URL) {
  const hostname = hostnameWithoutWww(url.hostname.toLowerCase());
  const root = hostnameRoot(hostname) || hostname;
  return titleCaseLabel(root || "Website");
}

export function inferDeterministicProfessionalLinkLabel(url: string) {
  const normalized = normalizeProfessionalLinkUrl(url);
  if (!normalized) return "";

  try {
    const parsed = new URL(normalized);
    return (
      getKnownDomainLabel(parsed.hostname) ??
      getHeuristicProfessionalLinkLabel(parsed) ??
      cleanedHostnameLabelFromUrl(parsed)
    );
  } catch {
    return "";
  }
}

export function normalizeProfessionalLinkUrl(input: string) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return "";

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";

    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }

    if (parsed.pathname !== "/") {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    }

    if (parsed.pathname === "/" && !parsed.search) {
      parsed.pathname = "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

export function needsAiProfessionalLinkLabel(url: string) {
  const normalized = normalizeProfessionalLinkUrl(url);
  if (!normalized) return false;

  try {
    const parsed = new URL(normalized);
    return !getKnownDomainLabel(parsed.hostname) && !getHeuristicProfessionalLinkLabel(parsed);
  } catch {
    return false;
  }
}

export async function inferProfessionalLinkLabel(
  url: string,
  options: InferProfessionalLinkLabelOptions = {}
) {
  const normalized = normalizeProfessionalLinkUrl(url);
  if (!normalized) return "";

  const deterministicLabel = inferDeterministicProfessionalLinkLabel(normalized);
  if (!needsAiProfessionalLinkLabel(normalized)) {
    return deterministicLabel;
  }

  if (options.aiFallback) {
    try {
      const aiLabel = normalizeProfessionalLinkLabelText(
        await options.aiFallback(normalized)
      );
      if (aiLabel) {
        return aiLabel;
      }
    } catch {
      // Fall through to hostname fallback.
    }
  }

  return deterministicLabel;
}

export function sanitizeProfessionalLinks(input: unknown): ProfessionalLink[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const links: ProfessionalLink[] = [];

  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object") continue;

    const record = candidate as Record<string, unknown>;
    const normalizedUrl = normalizeProfessionalLinkUrl(String(record.url ?? ""));
    if (!normalizedUrl) continue;

    const dedupeKey = normalizedUrl.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const normalizedLabel = normalizeProfessionalLinkLabelText(record.label);
    const source =
      record.source === "custom" && normalizedLabel ? "custom" : "auto";

    links.push({
      id:
        normalizeProfessionalLinkLabelText(record.id) ||
        createProfessionalLinkId(),
      url: normalizedUrl,
      label:
        normalizedLabel || inferDeterministicProfessionalLinkLabel(normalizedUrl),
      source,
    });
  }

  return links;
}

export function resolveProfessionalLinksForProfile(args: {
  professionalLinks?: unknown;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
}) {
  const savedLinks = sanitizeProfessionalLinks(args.professionalLinks);
  if (savedLinks.length) {
    return savedLinks;
  }

  return sanitizeProfessionalLinks([
    args.linkedinUrl
      ? {
          id: "legacy-linkedin",
          url: args.linkedinUrl,
          label: "LinkedIn",
          source: "auto",
        }
      : null,
    args.portfolioUrl
      ? {
          id: "legacy-portfolio",
          url: args.portfolioUrl,
          label:
            inferDeterministicProfessionalLinkLabel(args.portfolioUrl) || "Portfolio",
          source: "auto",
        }
      : null,
  ]);
}

export function getLegacyProfessionalLinkBackfill(links: ProfessionalLink[]) {
  let linkedinUrl: string | null = null;
  let portfolioUrl: string | null = null;

  for (const link of links) {
    const normalizedUrl = normalizeProfessionalLinkUrl(link.url);
    if (!normalizedUrl) continue;

    try {
      const parsed = new URL(normalizedUrl);
      const knownLabel = getKnownDomainLabel(parsed.hostname);
      const heuristicLabel = getHeuristicProfessionalLinkLabel(parsed);

      if (!linkedinUrl && knownLabel === "LinkedIn") {
        linkedinUrl = normalizedUrl;
      }

      if (
        !portfolioUrl &&
        (heuristicLabel === "Portfolio" ||
          heuristicLabel === "Personal Website" ||
          heuristicLabel === "Resume" ||
          heuristicLabel === "Blog")
      ) {
        portfolioUrl = normalizedUrl;
      }
    } catch {
      // Ignore invalid URLs; sanitize should have filtered them already.
    }
  }

  return { linkedinUrl, portfolioUrl };
}
