import type { JobPretty } from "@/app/lib/jobs/types";

function splitLines(s: string) {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function isHeading(line: string) {
    const h = line
      .toLowerCase()
      .replace(/[:\-–—]+$/g, "")
      .trim();
  
    const headings = [
      "job description",
      "position responsibilities",
      "required qualifications",
      "preferred qualifications",
      "security clearance",
      "visa sponsorship",
      "travel",
      "drug free workplace",
      "total rewards",
      "pay range",
      "equal opportunity employer",
      "conflict of interest",
      "education",
      "relocation",
      "shift",
      "important dates",
    ];
  
    if (headings.includes(h)) return true;
  
    return h.startsWith("applications for this position will be accepted until");
  }

function toBullets(lines: string[]) {
  return lines.map((l) => l.replace(/^[-•\u2022]\s*/, "").trim()).filter(Boolean);
}

function htmlToPrettyText(html: string) {
  return (
    html
      // normalize newlines
      .replace(/\r\n?/g, "\n")

      // turn paragraphs into blank-line separated blocks
      .replace(/<\/p>\s*/gi, "\n\n")
      .replace(/<p[^>]*>\s*/gi, "")

      // line breaks
      .replace(/<br\s*\/?>/gi, "\n")

      // list items -> "- "
      .replace(/<li[^>]*>\s*/gi, "- ")
      .replace(/<\/li>\s*/gi, "\n")
      .replace(/<\/?(ul|ol)[^>]*>\s*/gi, "\n")

      // headings / bold -> keep text, remove tags
      .replace(/<\/?(b|strong|em|i)[^>]*>/gi, "")

      // remove any other tags
      .replace(/<[^>]+>/g, "")

      // basic entity decoding (add more if needed)
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')

      // trim lines + collapse too many blank lines
      .split("\n")
      .map((l) => l.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export function prettyFromDescription(description: string): JobPretty {
  const normalized = description.includes("<") ? htmlToPrettyText(description) : description;

  const lines = splitLines(normalized);
  if (!lines.length) return { sections: [], highlights: [] };
 

  // Build sections by headings
  const sections: JobPretty["sections"] = [];
  let currentTitle: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (!currentTitle) return;
    const content = buf.slice();
    buf = [];

    // Decide bullets vs paragraphs
    const looksBullety =
      content.length >= 3 &&
      content.every((l) => l.length < 220); // heuristic

    if (looksBullety && /responsibilities|qualifications/i.test(currentTitle)) {
      sections.push({ title: currentTitle, kind: "bullets", bullets: toBullets(content) });
    } else {
      sections.push({ title: currentTitle, kind: "paragraphs", paragraphs: content });
    }
  };

  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      currentTitle = line
        .replace(/^applications for this position will be accepted until/i, "Important Dates")
        .trim();
      continue;
    }
    // If no heading yet, default into Job Description
    if (!currentTitle) currentTitle = "Job Description";
    buf.push(line);
  }
  flush();

  // Highlights (optional)
  const highlights: JobPretty["highlights"] = [];
  const pay = description.match(/\$[\d,]{2,}\s*[–-]\s*\$[\d,]{2,}/);
  if (pay) highlights.push({ label: "Pay Range", value: pay[0] });

  const deadline = description.match(/accepted until\s+([A-Za-z]{3,}\.?\s+\d{1,2},\s+\d{4})/i);
  if (deadline) highlights.push({ label: "Deadline", value: deadline[1] });

  const clearance = description.match(/Top Secret|Secret|Security Clearance/i);
  if (clearance) highlights.push({ label: "Clearance", value: "Security clearance required" });

  return { sections, highlights };
}
