"use client";

import type { JobPretty } from "@/app/lib/jobs/types";
import StructuredJobDescription from "@/app/components/jobs/StructuredJobDescription";

export function JobDescription({ pretty }: { pretty?: JobPretty | null }) {
  return <StructuredJobDescription pretty={pretty} emptyMessage="Pick a job to see the full details." />;
}
