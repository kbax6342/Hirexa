export type ScrapflySessionAttachment =
  | "human_agent"
  | "scrapfly_agent"
  | "available"
  | "unknown";

export type ScrapflySessionStatus = {
  sessionId: string;
  attachedBy: string | null;
  runtimeMs: number | null;
  timeout: number | null;
  attachment: ScrapflySessionAttachment;
};

function requireScrapflyApiKey() {
  const apiKey = process.env.SCRAPFLY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "[AUTO_APPLY_SCRAPFLY] Missing required env var: SCRAPFLY_API_KEY",
    );
  }
  return apiKey;
}

function normalizeAttachedBy(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function toNumberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function detectAttachment(attachedBy: string | null): ScrapflySessionAttachment {
  if (!attachedBy) return "available";
  if (attachedBy === "human_agent") return "human_agent";
  if (attachedBy === "scrapfly_agent") return "scrapfly_agent";
  return "unknown";
}

export async function getScrapflySessionStatus(sessionId: string) {
  const normalizedSessionId = String(sessionId ?? "").trim();
  if (!normalizedSessionId) return null;

  const apiKey = requireScrapflyApiKey();
  const response = await fetch(
    `https://browser.scrapfly.io/session/${encodeURIComponent(
      normalizedSessionId,
    )}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[AUTO_APPLY_SCRAPFLY] Session status lookup failed (${response.status}): ${text}`,
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const attachedBy = normalizeAttachedBy(
    payload.attached_by ?? payload.attachedBy,
  );
  const runtimeMs = toNumberOrNull(payload.runtime_ms ?? payload.runtimeMs);
  const timeout = toNumberOrNull(payload.timeout);
  const resolvedSessionId = String(
    payload.session_id ?? payload.sessionId ?? normalizedSessionId,
  ).trim();

  return {
    sessionId: resolvedSessionId || normalizedSessionId,
    attachedBy,
    runtimeMs,
    timeout,
    attachment: detectAttachment(attachedBy),
  } satisfies ScrapflySessionStatus;
}
