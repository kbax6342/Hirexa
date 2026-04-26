import { expect, test } from "@playwright/test";
import { resolveDirectJobUrl } from "@/app/lib/apply/directJobResolver";

test("prefers the employer careers result over aggregators for FMS acronym matches", async () => {
  const originalFetch = global.fetch;
  const originalSerpApiKey = process.env.SERPAPI_API_KEY;
  const cacheRef = globalThis as typeof globalThis & {
    __hirexaDirectJobResolutionCache?: Record<string, unknown>;
  };
  const originalCache = cacheRef.__hirexaDirectJobResolutionCache;
  const serpQueries: string[] = [];

  process.env.SERPAPI_API_KEY = "test-serpapi-key";
  cacheRef.__hirexaDirectJobResolutionCache = {};

  global.fetch = (async (input: string | URL | Request) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (requestUrl.startsWith("https://serpapi.com/search?")) {
      const parsed = new URL(requestUrl);
      serpQueries.push(parsed.searchParams.get("q") ?? "");

      return new Response(
        JSON.stringify({
          organic_results: [
            {
              position: 1,
              title: "FMS Software Engineer",
              link: "https://www.kronos-us.com/careers/fms-software-engineer",
              displayed_link: "https://www.kronos-us.com › careers",
              snippet:
                "Kronos Consulting. FMS Software Engineer. Location Phoenix AZ. Minimum of 8 years of experience in software development of Flight Management Systems.",
            },
            {
              position: 2,
              title: "Flight Management Systems Software Engineer",
              link: "https://www.ziprecruiter.com/jobs/kronos-consulting/flight-management-systems-software-engineer",
              displayed_link: "https://www.ziprecruiter.com",
              snippet:
                "Easy 1-Click Apply Kronos Consulting Flight Management Systems Software Engineer Full-Time in Phoenix, AZ.",
            },
            {
              position: 3,
              title: "SOFTWARE ENGINEER- AEROSPACE - HYBRID in Phoenix",
              link: "https://talents.vaia.com/jobs/software-engineer-aerospace-hybrid-phoenix",
              displayed_link: "https://talents.vaia.com",
              snippet:
                "Kronos Consulting is hiring a Flight Management Systems Software Engineer in Phoenix.",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (
      requestUrl.startsWith("https://html.duckduckgo.com/html/") ||
      requestUrl.startsWith("https://lite.duckduckgo.com/lite/")
    ) {
      return new Response("<html><body>No fallback results</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }

    if (
      requestUrl.startsWith(
        "https://www.kronos-us.com/careers/fms-software-engineer",
      )
    ) {
      return new Response(
        `
          <html>
            <head><title>FMS Software Engineer</title></head>
            <body>
              <h1>Kronos Consulting</h1>
              <p>FMS Software Engineer</p>
              <p>Location Phoenix AZ.</p>
              <p>Minimum of 8 years of experience in software development of Flight Management Systems.</p>
              <button>Apply now</button>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    if (
      requestUrl.startsWith(
        "https://www.ziprecruiter.com/jobs/kronos-consulting/flight-management-systems-software-engineer",
      )
    ) {
      return new Response(
        `
          <html>
            <head><title>Flight Management Systems Software Engineer</title></head>
            <body>
              <p>Easy 1-Click Apply Kronos Consulting Flight Management Systems Software Engineer Full-Time in Phoenix, AZ.</p>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    if (
      requestUrl.startsWith(
        "https://talents.vaia.com/jobs/software-engineer-aerospace-hybrid-phoenix",
      )
    ) {
      return new Response(
        `
          <html>
            <head><title>SOFTWARE ENGINEER- AEROSPACE - HYBRID in Phoenix</title></head>
            <body>
              <p>Kronos Consulting is hiring a Flight Management Systems Software Engineer in Phoenix.</p>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }

    return new Response("Not found", { status: 404 });
  }) as typeof fetch;

  try {
    const resolution = await resolveDirectJobUrl({
      title: "Flight Management Systems Software Engineer",
      company: "Kronos Consulting",
      location: "Phoenix, AZ",
      currentUrl:
        "https://www.adzuna.com/land/ad/5711084570?se=Mm_5pIZB8RG559CN95vx2w&utm_medium=api&utm_source=46399137&v=7E0CC986B1CCFAAE69F6203FA02372165A5C6E25",
      source: "adzuna",
      sourceJobId: "adzuna:test-kronos-fms",
    });

    expect(resolution.ok).toBeTruthy();
    expect(resolution.searchProvider).toBe("serpapi_google");
    expect(serpQueries.length).toBeGreaterThan(0);
    expect(serpQueries[0]?.toLowerCase()).toContain(
      "flight management systems software engineer",
    );
    expect(serpQueries[0]?.toLowerCase()).toContain("kronos consulting");
    expect(serpQueries[0]?.toLowerCase()).toContain("phoenix");
    expect(serpQueries[0]?.toLowerCase()).toContain("careers");
    expect(resolution.resolvedUrl).toBe(
      "https://www.kronos-us.com/careers/fms-software-engineer",
    );

    const selectedCandidate = resolution.candidates?.find((candidate) =>
      candidate.url.includes("kronos-us.com/careers"),
    );
    const zipRecruiterCandidate = resolution.candidates?.find((candidate) =>
      candidate.url.includes("ziprecruiter.com"),
    );

    expect(selectedCandidate).toBeTruthy();
    expect(selectedCandidate?.score).toBeGreaterThanOrEqual(70);
    expect(selectedCandidate?.matchedSignals).toEqual(
      expect.arrayContaining([
        "company_match",
        "company_domain_match",
        "careers_path",
        "location_match",
        "fms_acronym_title_match",
        "snippet_flight_management_systems_match",
      ]),
    );
    expect(zipRecruiterCandidate).toBeTruthy();
    expect((selectedCandidate?.score ?? 0) > (zipRecruiterCandidate?.score ?? 0)).toBeTruthy();
  } finally {
    global.fetch = originalFetch;
    process.env.SERPAPI_API_KEY = originalSerpApiKey;
    cacheRef.__hirexaDirectJobResolutionCache = originalCache;
  }
});
