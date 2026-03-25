import { normalizeLocationLabel, normalizeStateInput } from "@/app/lib/locationOptions";
import { isRemoteJob } from "@/app/lib/jobs/isRemoteJob";
import type { Job } from "@/app/lib/jobs/types";

export type JobMatchTier =
  | "exact"
  | "nearby"
  | "same_state"
  | "remote"
  | "broader"
  | "none";

export type JobLocationMatch = {
  tier: JobMatchTier;
  score: number;
  label: string | null;
};

type ParsedLocation = {
  label: string | null;
  normalizedText: string;
  city: string | null;
  stateCode: string | null;
  stateName: string | null;
};

const METRO_AREA_ALIASES: Record<string, string[]> = {
  "boston|ma": [
    "boston",
    "cambridge",
    "somerville",
    "brookline",
    "newton",
    "quincy",
    "waltham",
    "medford",
    "chelsea",
    "malden",
    "watertown",
    "suffolk county",
    "middlesex county",
    "norfolk county",
    "essex county",
  ],
  "detroit|mi": [
    "detroit",
    "dearborn",
    "warren",
    "troy",
    "southfield",
    "livonia",
    "novi",
    "royal oak",
    "sterling heights",
    "farmington hills",
    "dearborn heights",
    "canton",
    "wayne county",
    "oakland county",
    "macomb county",
    "washtenaw county",
  ],
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLocation(value: string | null | undefined): ParsedLocation {
  const label = normalizeLocationLabel(String(value ?? ""));
  if (!label) {
    return {
      label: null,
      normalizedText: "",
      city: null,
      stateCode: null,
      stateName: null,
    };
  }

  const parts = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const normalizedText = normalizeText(label);

  if (parts.length >= 2) {
    const state = normalizeStateInput(parts.slice(1).join(" "));
    return {
      label,
      normalizedText,
      city: normalizeText(parts[0]) || null,
      stateCode: state?.code.toLowerCase() ?? null,
      stateName: state?.name.toLowerCase() ?? null,
    };
  }

  const state = normalizeStateInput(label);
  if (state) {
    return {
      label,
      normalizedText,
      city: null,
      stateCode: state.code.toLowerCase(),
      stateName: state.name.toLowerCase(),
    };
  }

  return {
    label,
    normalizedText,
    city: normalizeText(label) || null,
    stateCode: null,
    stateName: null,
  };
}

function hasSameState(preferred: ParsedLocation, candidate: ParsedLocation) {
  if (preferred.stateCode && candidate.stateCode) {
    return preferred.stateCode === candidate.stateCode;
  }

  if (preferred.stateName && candidate.stateName) {
    return preferred.stateName === candidate.stateName;
  }

  if (preferred.stateCode && candidate.normalizedText) {
    return candidate.normalizedText.includes(preferred.stateCode);
  }

  if (preferred.stateName && candidate.normalizedText) {
    return candidate.normalizedText.includes(preferred.stateName);
  }

  return false;
}

function getMetroAliases(preferred: ParsedLocation) {
  const stateKey = preferred.stateCode ?? preferred.stateName ?? "";
  const baseKey = preferred.city ? `${preferred.city}|${stateKey}` : "";

  return new Set(
    [
      preferred.city,
      ...(METRO_AREA_ALIASES[baseKey] ?? []),
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean)
  );
}

export function getJobLocationMatch(
  job: Pick<Job, "title" | "location" | "description" | "searchText">,
  preferredLocation: string | null | undefined,
  includeRemote: boolean
): JobLocationMatch {
  const remote = isRemoteJob(job);
  const preferred = parseLocation(preferredLocation);

  if (!preferred.label) {
    if (remote && includeRemote) {
      return { tier: "remote", score: 70, label: "Remote match" };
    }

    return { tier: "broader", score: 50, label: null };
  }

  if (remote) {
    return includeRemote
      ? { tier: "remote", score: 60, label: "Remote match" }
      : { tier: "none", score: -1, label: null };
  }

  const candidate = parseLocation(job.location);
  const candidateText = normalizeText(
    [job.location, candidate.label].filter(Boolean).join(" ")
  );
  const hasExactLabel =
    Boolean(candidate.label) &&
    normalizeText(candidate.label) === preferred.normalizedText;
  const hasCityMatch = Boolean(preferred.city) && candidateText.includes(preferred.city ?? "");
  const sameState = hasSameState(preferred, candidate);
  const metroAliases = getMetroAliases(preferred);
  const hasMetroMatch =
    sameState &&
    Array.from(metroAliases).some(
      (alias) => alias && alias !== preferred.city && candidateText.includes(alias)
    );

  if (hasExactLabel || (hasCityMatch && (!preferred.stateCode || sameState))) {
    return { tier: "exact", score: 100, label: null };
  }

  if (hasMetroMatch) {
    return { tier: "nearby", score: 80, label: "Nearby match" };
  }

  if (sameState || hasCityMatch) {
    return { tier: "same_state", score: 70, label: "State match" };
  }

  return { tier: "broader", score: 40, label: "Broader match" };
}

export function applyLocationMatchMetadata<T extends Job>(
  jobs: readonly T[],
  preferredLocation: string | null | undefined,
  includeRemote: boolean
) {
  return jobs
    .map((job) => {
      const match = getJobLocationMatch(job, preferredLocation, includeRemote);
      return {
        ...job,
        matchTier: match.tier === "none" ? undefined : match.tier,
        matchLabel: match.label,
      };
    })
    .filter((job) => job.matchTier !== undefined);
}

export function summarizeLocationMatchTiers<T extends Job>(
  jobs: readonly T[],
  preferredLocation: string | null | undefined,
  includeRemote: boolean
) {
  return jobs.reduce(
    (summary, job) => {
      const match = getJobLocationMatch(job, preferredLocation, includeRemote);
      summary[match.tier] += 1;
      return summary;
    },
    {
      exact: 0,
      nearby: 0,
      same_state: 0,
      remote: 0,
      broader: 0,
      none: 0,
    } as Record<JobMatchTier, number>
  );
}
