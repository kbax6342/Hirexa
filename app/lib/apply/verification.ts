export const VERIFICATION_GATE_SIGNALS = [
  "just a moment",
  "checking your browser",
  "checking if the site connection is secure",
  "verify you are human",
  "verify you're human",
  "verify that you are human",
  "human verification",
  "performing security verification",
  "captcha",
  "cloudflare",
  "turnstile",
  "press & hold",
  "press and hold",
  "security check",
  "unusual traffic",
  "please enable javascript and cookies",
] as const;

export type VerificationDetectionInput = {
  status?: string | null;
  lastAction?: string | null;
  url?: string | null;
  title?: string | null;
  pageText?: string | null;
  pageHtml?: string | null;
  verificationSignals?: Array<string | null | undefined>;
};

export type VerificationDetectionResult = {
  detected: boolean;
  pageType: "verification_gate";
  reason: "Human verification required";
  signal?: string;
  evidence?: string;
};

function normalizeSignalText(input: VerificationDetectionInput) {
  return [
    input.status,
    input.lastAction,
    input.url,
    input.title,
    input.pageText,
    input.pageHtml,
    ...(input.verificationSignals ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n")
    .toLowerCase();
}

function extractEvidenceSnippet(value: string, signal: string) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;

  const index = collapsed.toLowerCase().indexOf(signal.toLowerCase());
  if (index < 0) return collapsed.slice(0, 280);

  const start = Math.max(0, index - 90);
  const end = Math.min(collapsed.length, index + signal.length + 160);
  return collapsed.slice(start, end).trim();
}

export function detectVerificationGate(
  input: VerificationDetectionInput,
): VerificationDetectionResult {
  const signalText = normalizeSignalText(input);
  const signal = VERIFICATION_GATE_SIGNALS.find((item) =>
    signalText.includes(item),
  );

  if (!signal) {
    return {
      detected: false,
      pageType: "verification_gate",
      reason: "Human verification required",
    };
  }

  const evidence = extractEvidenceSnippet(
    [
      input.title,
      input.pageText,
      input.url,
      ...(input.verificationSignals ?? []),
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join("\n"),
    signal,
  );

  return {
    detected: true,
    pageType: "verification_gate",
    reason: "Human verification required",
    signal,
    evidence: evidence ?? undefined,
  };
}
