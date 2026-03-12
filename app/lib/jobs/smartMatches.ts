import { fetchAdzunaJobDetails } from "@/app/lib/providers/adzuna";

export type SmartMatchJob = {
  id: string;
  source: "greenhouse" | "adzuna";
  title: string;
  company: string;
  location: string;
  jobUrl?: string | null;
};

type GreenhouseJobDetails = {
  id: number | string;
  title?: string;
  absolute_url?: string;
  location?: { name?: string } | null;
};

const LABEL_OVERRIDES: Record<string, string> = {
  himsandhers: "Hims & Hers",
  openai: "OpenAI",
  spacex: "SpaceX",
  cityblockhealth: "Cityblock Health",
  includedhealth: "Included Health",
  modernhealth: "Modern Health",
  devotedhealth: "Devoted Health",
  caredx: "CareDx",
  jobyaviation: "Joby Aviation",
  aurorainnovation: "Aurora Innovation",
  formenergy: "Form Energy",
  commonenergy: "Common Energy",
};

function toTitleCaseSlug(slug: string) {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function boardToCompanyLabel(board: string) {
  return LABEL_OVERRIDES[board] ?? toTitleCaseSlug(board);
}

function decodeGreenhouseJobId(jobId: string) {
  if (jobId.startsWith("greenhouse:")) {
    const encoded = jobId.slice("greenhouse:".length);

    try {
      const decoded = Buffer.from(encoded, "base64url").toString("utf8");
      const [board, rawId] = decoded.split("::");
      if (!board || !rawId) return null;

      return {
        board,
        rawId,
        normalizedId: jobId,
      };
    } catch {
      return null;
    }
  }

  if (!jobId.includes(":")) return null;
  const [board, rawId] = jobId.split(":");
  if (!board || !rawId) return null;

  return {
    board,
    rawId,
    normalizedId: `greenhouse:${Buffer.from(
      `${board}::${rawId}`,
      "utf8"
    ).toString("base64url")}`,
  };
}

async function fetchGreenhouseJob(jobId: string): Promise<SmartMatchJob | null> {
  const decoded = decodeGreenhouseJobId(jobId);
  if (!decoded) return null;

  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    decoded.board
  )}/jobs/${encodeURIComponent(decoded.rawId)}?content=true`;

  const res = await fetch(apiUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const data = (await res.json()) as GreenhouseJobDetails;

  return {
    id: decoded.normalizedId,
    source: "greenhouse",
    title: data.title ?? "Untitled role",
    company: boardToCompanyLabel(decoded.board),
    location: data.location?.name ?? "Unknown location",
    jobUrl: data.absolute_url ?? null,
  };
}

async function fetchAdzunaJob(jobId: string, origin?: string): Promise<SmartMatchJob | null> {
  if (!origin) return null;
  const job = await fetchAdzunaJobDetails(jobId, origin);
  if (!job) return null;

  return {
    id: job.id,
    source: "adzuna",
    title: job.title ?? "Untitled role",
    company: job.company ?? "Unknown company",
    location: job.location ?? "Unknown location",
    jobUrl: job.jobUrl ?? null,
  };
}

export async function fetchSmartMatchJobById(params: {
  userId: string | null;
  jobId: string;
  origin?: string;
}): Promise<SmartMatchJob | null> {
  if (!params.userId) return null;
  const jobId = params.jobId.trim();
  if (!jobId) return null;

  if (jobId.startsWith("adzuna:")) {
    return fetchAdzunaJob(jobId, params.origin);
  }

  return fetchGreenhouseJob(jobId);
}
