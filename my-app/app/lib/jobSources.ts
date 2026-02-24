export type DerivedJobSource = "greenhouse" | "adzuna_external" | "unknown";

function toHttps(url: string) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export function normalizeJobUrl(url: string): string {
  return toHttps(String(url ?? "").trim());
}

export function isGreenhouseUrl(url: string): boolean {
  const normalized = normalizeJobUrl(url);
  if (!normalized) return false;

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (host.endsWith("greenhouse.io")) return true;
    return host.includes("greenhouse") && path.includes("apply");
  } catch {
    return false;
  }
}

export function deriveSourceFromUrl(url: string): DerivedJobSource {
  if (isGreenhouseUrl(url)) return "greenhouse";
  const normalized = normalizeJobUrl(url);
  if (!normalized) return "unknown";
  return "adzuna_external";
}
