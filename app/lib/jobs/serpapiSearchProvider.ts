import { normalizeJobUrl } from "@/app/lib/jobSources";

export type SerpApiJobSearchResult = {
  title: string;
  url: string;
  snippet?: string | null;
  displayedUrl?: string | null;
  provider: "serpapi_google";
  position?: number | null;
};

type SerpApiOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  displayed_link?: string;
  position?: number;
};

export async function searchGoogleWithSerpApi(input: {
  query: string;
  location?: string | null;
  limit?: number;
}): Promise<SerpApiJobSearchResult[]> {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[SERPAPI_GOOGLE_SEARCH] missing SERPAPI_API_KEY");
    return [];
  }

  const query = String(input.query ?? "").trim();
  if (!query) {
    return [];
  }

  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: apiKey,
    gl: "us",
    hl: "en",
    output: "json",
    num: String(Math.max(1, Math.min(input.limit ?? 10, 10))),
  });

  if (input.location) {
    params.set("location", String(input.location).trim());
  }

  const endpoint = `https://serpapi.com/search?${params.toString()}`;
  console.info("[SERPAPI_GOOGLE_SEARCH] search started", {
    query,
    hasLocation: Boolean(input.location),
    limit: Math.max(1, Math.min(input.limit ?? 10, 10)),
  });

  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      console.warn("[SERPAPI_GOOGLE_SEARCH] request failed", {
        status: response.status,
        query,
        bodySnippet: responseBody.slice(0, 240),
      });
      return [];
    }

    const payload = (await response.json()) as {
      organic_results?: SerpApiOrganicResult[];
    };

    const results: SerpApiJobSearchResult[] = [];
    for (const result of payload.organic_results ?? []) {
        const title = String(result.title ?? "").trim();
        const url = normalizeJobUrl(String(result.link ?? "").trim());
        if (!title || !url) continue;

        results.push({
          title,
          url,
          snippet: String(result.snippet ?? "").trim() || null,
          displayedUrl: String(result.displayed_link ?? "").trim() || null,
          provider: "serpapi_google" as const,
          position:
            typeof result.position === "number" && Number.isFinite(result.position)
              ? result.position
              : null,
        } satisfies SerpApiJobSearchResult);
      }

    console.info("[SERPAPI_GOOGLE_SEARCH] search completed", {
      query,
      resultCount: results.length,
    });
    console.info("[SERPAPI_SEARCH] Step 2 completed: SerpAPI Google provider added");
    return results;
  } catch (error) {
    console.warn("[SERPAPI_GOOGLE_SEARCH] request errored", {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export const searchWithSerpApiGoogle = searchGoogleWithSerpApi;
