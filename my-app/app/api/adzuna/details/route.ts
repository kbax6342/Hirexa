import "server-only";
import { NextResponse } from "next/server";

function decodeHtml(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(s: string) {
  return decodeHtml(
    s
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

function stripHtml(html: string) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|br|li|h1|h2|h3|h4|h5|h6|section|article)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .trim();

  return cleanText(cleaned);
}

function pickLongest(arr: string[]) {
  return arr
    .map((x) => x?.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0];
}

function extractJsonLdDescription(html: string) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const descs: string[] = [];

  for (const m of blocks) {
    const raw = m[1]?.trim();
    if (!raw) continue;

    try {
      const obj = JSON.parse(raw);

      // Sometimes it's an array
      const items = Array.isArray(obj) ? obj : [obj];

      for (const it of items) {
        const d = it?.description;
        if (typeof d === "string") descs.push(cleanText(d));
      }
    } catch {}
  }

  return pickLongest(descs);
}

function extractTitle(html: string) {
  // Prefer <h1>
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) return stripHtml(h1[1]);

  // fallback: <title>
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title?.[1]) return stripHtml(title[1]).replace(/\s*\|\s*Adzuna\s*$/i, "");

  return "";
}

function extractLocationFromText(titleText: string) {
  // Adzuna titles often look like: "X Job in City; ST"
  const m = titleText.match(/Job in\s+(.+?)\s*$/i);
  return m?.[1]?.trim() ?? "";
}

function extractMainDescription(html: string) {
  // 1) Best: JSON-LD description
  const jsonLd = extractJsonLdDescription(html);
  if (jsonLd && jsonLd.length > 200) return jsonLd;

  // 2) Try to find a “Description” section by common patterns
  // Look for a block containing "Description" and take a chunk after it.
  const markerIdx = html.search(/>\s*Description\s*</i);
  if (markerIdx !== -1) {
    const slice = html.slice(markerIdx, markerIdx + 60000); // take a big chunk after
    const text = stripHtml(slice);

    // Heuristic: stop before obvious footer markers
    const cut = text.split(/\n\n(Jobseekers|Recruiters|Adzuna|Country selection|©|Terms & Conditions)\b/i)[0];
    const cleaned = cleanText(cut);

    if (cleaned.length > 300) return cleaned;
  }

  // 3) Fallback: strip whole page but remove obvious footer/nav chunks
  const all = stripHtml(html);
  const cut = all.split(/\n\n(Jobseekers|Recruiters|Adzuna|Country selection|©|Terms & Conditions)\b/i)[0];
  return cleanText(cut);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

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
        { error: `Failed to fetch Adzuna details page (${res.status})`, snippet: text.slice(0, 200) },
        { status: 404 }
      );
    }

    const html = await res.text();

    const title = extractTitle(html);
    const location = extractLocationFromText(title);
    const description = extractMainDescription(html);

    return NextResponse.json({
      id,
      title,
      location,
      heading: `Full Description\n${title}`,
      description,
      detailsUrl,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
