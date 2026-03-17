type CandidateKind =
  | "requested"
  | "requested-state"
  | "saved"
  | "related"
  | "high-volume"
  | "remote"
  | "nationwide"
  | "unfiltered";

type Candidate = {
  location: string;
  stateKey: string | null;
  stateName: string | null;
  kind: CandidateKind;
};

type FailedStateCache = Map<string, number>;

type GlobalFailedStateCache = typeof globalThis & {
  __hirexaFailedJobStates__?: FailedStateCache;
};

export type LocationResolutionMetadata = {
  requestedState: string | null;
  resolvedState: string | null;
  fallbackUsed: boolean;
  attemptedStates: string[];
};

export type LocationResolutionResult<T> = LocationResolutionMetadata & {
  result: T | null;
};

export type ResolveLocationFallbackOptions<T> = {
  preferredLocation: string | null;
  additionalLocations?: Array<string | null | undefined>;
  leadingLocations?: Array<string | null | undefined>;
  includeRemote?: boolean;
  maxAttempts?: number;
  timeoutMs?: number;
  fetchForLocation: (location: string) => Promise<T>;
  isUsableResult?: (result: T) => boolean;
};

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_ATTEMPTS = 8;
const FAILED_STATE_TTL_MS = 10 * 60 * 1000;
const HIGH_VOLUME_STATES = [
  "California",
  "Texas",
  "New York",
  "Florida",
  "Illinois",
  "Washington",
  "Georgia",
  "North Carolina",
] as const;

const STATE_CODE_TO_NAME = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
} as const;

const STATE_NAME_TO_CODE = Object.fromEntries(
  Object.entries(STATE_CODE_TO_NAME).map(([code, name]) => [name.toLowerCase(), code])
) as Record<string, keyof typeof STATE_CODE_TO_NAME>;

const NEARBY_STATE_MAP: Partial<Record<string, readonly string[]>> = {
  California: ["Nevada", "Arizona", "Oregon", "Washington"],
  Florida: ["Georgia", "North Carolina", "Texas"],
  Georgia: ["Florida", "North Carolina", "Tennessee"],
  Illinois: ["Indiana", "Wisconsin", "Michigan", "Ohio"],
  Michigan: ["Ohio", "Indiana", "Illinois", "Wisconsin"],
  "New York": ["New Jersey", "Pennsylvania", "Massachusetts", "Connecticut"],
  "North Carolina": ["Georgia", "Florida", "Virginia", "Tennessee"],
  Ohio: ["Michigan", "Indiana", "Illinois", "Pennsylvania"],
  Pennsylvania: ["New York", "New Jersey", "Ohio", "Massachusetts"],
  Texas: ["Florida", "Georgia", "North Carolina", "Illinois"],
  Virginia: ["North Carolina", "Georgia", "Pennsylvania", "Florida"],
  Washington: ["Oregon", "California", "Colorado", "Texas"],
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getFailedStateCache() {
  const globalCache = globalThis as GlobalFailedStateCache;
  if (!globalCache.__hirexaFailedJobStates__) {
    globalCache.__hirexaFailedJobStates__ = new Map<string, number>();
  }

  return globalCache.__hirexaFailedJobStates__;
}

function pruneFailedStateCache() {
  const cache = getFailedStateCache();
  const now = Date.now();
  for (const [key, timestamp] of cache.entries()) {
    if (now - timestamp > FAILED_STATE_TTL_MS) {
      cache.delete(key);
    }
  }
}

function markStateFailed(stateKey: string | null) {
  if (!stateKey) return;
  pruneFailedStateCache();
  getFailedStateCache().set(stateKey, Date.now());
}

function isStateTemporarilyUnavailable(stateKey: string | null) {
  if (!stateKey) return false;
  pruneFailedStateCache();
  const timestamp = getFailedStateCache().get(stateKey);
  if (!timestamp) return false;
  return Date.now() - timestamp < FAILED_STATE_TTL_MS;
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseLocationState(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) {
    return {
      location: "",
      stateKey: null,
      stateName: null,
      remoteLike: false,
      nationwideLike: false,
    };
  }

  const normalized = normalizeText(raw).replace(/\./g, "");
  if (normalized === "remote") {
    return {
      location: "remote",
      stateKey: null,
      stateName: null,
      remoteLike: true,
      nationwideLike: false,
    };
  }

  if (normalized === "nationwide" || normalized === "united states" || normalized === "usa") {
    return {
      location: raw,
      stateKey: null,
      stateName: null,
      remoteLike: false,
      nationwideLike: true,
    };
  }

  const commaSegments = raw
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const lastSegment = commaSegments.at(-1) ?? raw;
  const compactLastSegment = lastSegment.replace(/\./g, "").trim();
  const uppercaseCode = compactLastSegment.toUpperCase() as keyof typeof STATE_CODE_TO_NAME;

  if (compactLastSegment.length === 2 && STATE_CODE_TO_NAME[uppercaseCode]) {
    return {
      location: raw,
      stateKey: uppercaseCode.toLowerCase(),
      stateName: STATE_CODE_TO_NAME[uppercaseCode],
      remoteLike: false,
      nationwideLike: false,
    };
  }

  const normalizedLastSegment = normalizeText(compactLastSegment);
  if (STATE_NAME_TO_CODE[normalizedLastSegment]) {
    const stateCode = STATE_NAME_TO_CODE[normalizedLastSegment];
    return {
      location: raw,
      stateKey: stateCode.toLowerCase(),
      stateName: STATE_CODE_TO_NAME[stateCode],
      remoteLike: false,
      nationwideLike: false,
    };
  }

  for (const [stateName, stateCode] of Object.entries(STATE_NAME_TO_CODE)) {
    if (normalized.endsWith(stateName)) {
      return {
        location: raw,
        stateKey: stateCode.toLowerCase(),
        stateName: STATE_CODE_TO_NAME[stateCode],
        remoteLike: false,
        nationwideLike: false,
      };
    }
  }

  for (const [stateCode, stateName] of Object.entries(STATE_CODE_TO_NAME)) {
    if (normalized.endsWith(` ${stateCode.toLowerCase()}`)) {
      return {
        location: raw,
        stateKey: stateCode.toLowerCase(),
        stateName,
        remoteLike: false,
        nationwideLike: false,
      };
    }
  }

  return {
    location: raw,
    stateKey: null,
    stateName: null,
    remoteLike: false,
    nationwideLike: false,
  };
}

function candidateLabel(candidate: Candidate) {
  if (candidate.stateName) return candidate.stateName;
  if (candidate.kind === "remote") return "Remote";
  if (candidate.kind === "nationwide") return "United States";
  if (candidate.kind === "unfiltered") return "Anywhere";
  return candidate.location || "Anywhere";
}

function isStateLevelCandidate(candidate: Candidate) {
  if (!candidate.stateKey || !candidate.stateName) {
    return false;
  }

  const normalizedLocation = normalizeText(candidate.location);
  const normalizedState = normalizeText(candidate.stateName);
  return Boolean(
    normalizedLocation &&
      !candidate.location.includes(",") &&
      (candidate.location.trim().length === 2 || normalizedLocation === normalizedState)
  );
}

function buildLocationCandidates(options: {
  preferredLocation: string | null;
  additionalLocations?: Array<string | null | undefined>;
  leadingLocations?: Array<string | null | undefined>;
  includeRemote?: boolean;
}) {
  const requested = parseLocationState(options.preferredLocation);
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const hasExplicitLocationPreference = Boolean(
    requested.location ||
      (options.leadingLocations ?? []).some((value) => Boolean(String(value ?? "").trim())) ||
      (options.additionalLocations ?? []).some((value) => Boolean(String(value ?? "").trim()))
  );

  const pushCandidate = (rawLocation: string | null | undefined, kind: CandidateKind) => {
    const parsed = parseLocationState(rawLocation);
    const normalizedLocation = parsed.location.trim();
    const key = [normalizeText(normalizedLocation), parsed.stateKey ?? ""].join("|");

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    candidates.push({
      location: normalizedLocation,
      stateKey: parsed.stateKey,
      stateName: parsed.stateName,
      kind,
    });
  };

  for (const location of options.leadingLocations ?? []) {
    pushCandidate(location ?? null, "saved");
  }

  pushCandidate(requested.location, "requested");

  if (requested.stateName && normalizeText(requested.location) !== normalizeText(requested.stateName)) {
    pushCandidate(requested.stateName, "requested-state");
  }

  for (const location of options.additionalLocations ?? []) {
    pushCandidate(location ?? null, "saved");
  }

  for (const stateName of NEARBY_STATE_MAP[requested.stateName ?? ""] ?? []) {
    pushCandidate(stateName, "related");
  }

  if (hasExplicitLocationPreference) {
    for (const stateName of HIGH_VOLUME_STATES) {
      pushCandidate(stateName, "high-volume");
    }
  }

  if (options.includeRemote !== false) {
    pushCandidate("remote", "remote");
  }

  pushCandidate("United States", "nationwide");
  pushCandidate("", "unfiltered");

  return {
    requestedState: requested.stateName,
    candidates,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export async function resolveLocationFallback<T>(
  options: ResolveLocationFallbackOptions<T>
): Promise<LocationResolutionResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const { requestedState, candidates } = buildLocationCandidates({
    preferredLocation: options.preferredLocation,
    additionalLocations: options.additionalLocations,
    leadingLocations: options.leadingLocations,
    includeRemote: options.includeRemote,
  });
  const attemptedStates: string[] = [];

  for (const candidate of candidates.slice(0, maxAttempts)) {
    const label = candidateLabel(candidate);
    if (!attemptedStates.includes(label)) {
      attemptedStates.push(label);
    }

    if (candidate.stateKey && isStateTemporarilyUnavailable(candidate.stateKey)) {
      console.warn("[JOBS] skipping recently failed state", {
        state: candidate.stateName,
        requestedState,
      });
      continue;
    }

    try {
      const result = await withTimeout(
        options.fetchForLocation(candidate.location),
        timeoutMs,
        `Job fetch for ${label}`
      );
      const usable = options.isUsableResult
        ? options.isUsableResult(result)
        : Boolean(result);

      if (!usable) {
        if (isStateLevelCandidate(candidate)) {
          markStateFailed(candidate.stateKey);
        }
        console.warn("[JOBS] location attempt returned no usable jobs", {
          requestedState,
          attempted: label,
          kind: candidate.kind,
        });
        continue;
      }

      return {
        result,
        requestedState,
        resolvedState: candidate.stateName ?? null,
        fallbackUsed: candidate.kind !== "requested",
        attemptedStates,
      };
    } catch (error) {
      if (isStateLevelCandidate(candidate)) {
        markStateFailed(candidate.stateKey);
      }
      console.error("[JOBS] location attempt failed", {
        requestedState,
        attempted: label,
        kind: candidate.kind,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    result: null,
    requestedState,
    resolvedState: null,
    fallbackUsed: false,
    attemptedStates,
  };
}

export function formatResolvedStateMessage(metadata: LocationResolutionMetadata) {
  if (
    !metadata.fallbackUsed ||
    !metadata.requestedState ||
    !metadata.resolvedState ||
    metadata.requestedState === metadata.resolvedState
  ) {
    return null;
  }

  return `Showing jobs from ${toTitleCase(
    metadata.resolvedState
  )} because no jobs were found for ${toTitleCase(metadata.requestedState)} right now.`;
}
