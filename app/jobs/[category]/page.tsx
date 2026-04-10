// /Hirexa/my-app/app/jobs/[category]/page.tsx
import { headers } from "next/headers";

import { getSiteUrl } from "@/app/lib/site-url";

import JobsExplorerClient, { type Job } from "./JobsExploreClient";

type JobsResponse = {
  jobs?: Job[];
  items?: Job[];
};

function titleize(slug: string) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

async function loadInitialJobs(categorySlug: string) {
  try {
    const headerList = await headers();
    const host =
      headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
    const proto =
      headerList.get("x-forwarded-proto") ??
      (host.includes("localhost") ? "http" : "https");
    const origin = host ? `${proto}://${host}` : getSiteUrl();
    const url = new URL("/api/jobs", origin);
    const cookie = headerList.get("cookie");

    url.searchParams.set("category", categorySlug);

    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: cookie ? { cookie } : undefined,
    });

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as JobsResponse;
    return data.jobs ?? data.items ?? [];
  } catch {
    return [];
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const categorySlug = (category ?? "all").toLowerCase();
  const categoryLabel = titleize(categorySlug);
  const initialJobs = await loadInitialJobs(categorySlug);

  return (
    <JobsExplorerClient
      categorySlug={categorySlug}
      categoryLabel={categoryLabel}
      initialJobs={initialJobs}
    />
  );
}
