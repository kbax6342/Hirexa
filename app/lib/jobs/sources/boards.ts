export const GREENHOUSE_COMPANIES = [
  "stripe",
  "datadog",
  "discord",
  "coinbase",
  "robinhood",
  "flexport",
  "scaleai",
  "brex",
] as const;

export const LEVER_COMPANIES = [
  "netflix",
  "palantir",
] as const;

export const ASHBY_COMPANIES = [
  "openai",
  "cursor",
  "retool",
] as const;

// Removed default Workable boards after repeated 404s from:
// automattic, invision, hotjar
export const WORKABLE_COMPANIES: readonly string[] = [];
