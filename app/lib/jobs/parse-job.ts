import type { JobPretty } from "./types";
import { prettyFromDescription } from "./pretty-from-text";

export function parseJobDescription(raw: string): JobPretty {
  return prettyFromDescription(raw);
}
