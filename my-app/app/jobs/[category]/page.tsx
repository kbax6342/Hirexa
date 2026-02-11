// /Hirexa/my-app/app/jobs/[category]/page.tsx
import JobsExplorerClient, { type Job } from "./JobsExploreClient";

function titleize(slug: string) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export default async function Page({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const categorySlug = (category ?? "all").toLowerCase();
  const categoryLabel = titleize(categorySlug);

  // ✅ for now, pass empty jobs so the client will fetch from /api/jobs
  const initialJobs: Job[] = [];

  return (
    <JobsExplorerClient
      categorySlug={categorySlug}
      categoryLabel={categoryLabel}
      initialJobs={initialJobs}
    />
  );
}
