// app/api/home-sections/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const revalidate = 60 * 30;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type JobCard = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  jobUrl: string;
  logoText: string; // REQUIRED
  pill?: string;
};

type CategorySection = {
  name: string;
  viewAllHref: string;
  jobs: JobCard[];
};

type HomeSectionsResponse = {
  sections: CategorySection[];
  generatedAt: string;
};

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function addUuids(data: HomeSectionsResponse): HomeSectionsResponse {
  return {
    ...data,
    sections: data.sections.map((section) => ({
      ...section,
      jobs: section.jobs.map((job) => ({
        id: Buffer.from(job.jobUrl).toString("base64url"), // server-generated stable id for this response
        ...job,
      })),
    })),
  };
}

export async function GET() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const prompt = `
You are building a jobs homepage section for the United States.

Task:
1) Determine the top 3 job search categories in the US right now.
2) For each category, provide 3 currently active job postings in the US.
3) Return ONLY valid JSON. No markdown. No explanations.

Rules:
- Each job MUST include a working jobUrl.
- Use real company names.
- location must be "City, ST" or "Remote".
- posted can be approximate.
- logoText MUST be the first letter of the company name (uppercase).
- DO NOT include logoUrl.
- pill should be salary if clearly shown; otherwise omit.

Schema:
{
  "sections": [
    {
      "name": string,
      "viewAllHref": string,
      "jobs": [
        {
          "title": string,
          "company": string,
          "location": string,
          "posted": string,
          "jobUrl": string,
          "logoText": string,
          "pill"?: string,
          "benefits": string,
          "requirements": string,
          "descriptions": string,
          "responsiblities": string

        }
      ]
    }
  ],
  "generatedAt": string
}

For viewAllHref use "/jobs/category/<slug>".
Example: "/jobs/category/customer-service"
`.trim();

    const resp = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
      // Forces a single JSON object back (no markdown)
      response_format: { type: "json_object" },
    });

    const text = resp.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = safeJsonParse<HomeSectionsResponse>(text);

    if (!parsed?.sections?.length) {
      return NextResponse.json(
        { error: "Invalid JSON from model", raw: text },
        { status: 502 }
      );
    }

    const withUuids = addUuids(parsed);
    //console.log(withUuids)
    return NextResponse.json(withUuids);
  } catch (err: any) {
    console.error("home-sections error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error", stack: err?.stack ?? null },
      { status: 500 }
    );
  }
}
