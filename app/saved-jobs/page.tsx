"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import JobCard, { type JobCardData } from "@/app/components/jobs/JobCard";
import MobileListLoadingScreen from "@/app/components/loading/MobileListLoadingScreen";
import LoginFooter from "@/app/components/loginFooter/LoginFooter";
import AppliedJobsPopout from "@/app/components/apply/AppliedJobsPopout";

type SavedJob = {
  id: string;
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  createdAt: string;
};

type SavedJobsListResponse = {
  jobs?: SavedJob[];
  error?: string;
};

function formatSavedLabel(value: string) {
  const savedAt = new Date(value);

  if (Number.isNaN(savedAt.getTime())) {
    return "Saved job";
  }

  return `Saved ${savedAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function mapSavedJobToCard(job: SavedJob): JobCardData {
  return {
    id: job.jobId,
    title: job.title,
    company: job.company,
    location: job.location?.trim() || "Location not provided",
    jobUrl: job.url,
    url: job.url,
    pill: formatSavedLabel(job.createdAt),
    logoText: job.company?.[0]?.toUpperCase() ?? "•",
  };
}

export default function SavedJobsPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedJobs() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/saved-jobs/list", {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as SavedJobsListResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load saved jobs.");
        }

        if (!cancelled) {
          setSavedJobs(data.jobs ?? []);
        }
      } catch (nextError: unknown) {
        if (!cancelled) {
          setSavedJobs([]);
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to load saved jobs."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (authStatus === "loading") {
      return;
    }

    if (authStatus !== "authenticated") {
      setSavedJobs([]);
      setError(null);
      setLoading(false);
      return;
    }

    void loadSavedJobs();

    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  const cards = useMemo(
    () =>
      savedJobs.map((job) => ({
        id: job.id,
        card: mapSavedJobToCard(job),
      })),
    [savedJobs]
  );

  return (
    <>
      <main className="min-h-screen bg-background">
        <section className="border-b border-border/60">
          <div className="mx-auto max-w-7xl px-6 pb-10 pt-10">
            <div className="text-xs text-muted-foreground">
              <Link
                href="/"
                className="font-medium text-foreground/80 hover:text-foreground hover:underline"
              >
                Home
              </Link>{" "}
              <span className="mx-1 opacity-60">›</span>
              <span className="text-foreground">Saved Jobs</span>
            </div>

            <div className="mt-10">
              <div className="text-[11px] font-semibold tracking-wider text-accent">
                SAVED JOBS
              </div>
              <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Keep your shortlist ready for the next application session
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                Save promising roles from the job feed and come back to them anytime.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-12">
          {authStatus === "loading" || loading ? (
            <MobileListLoadingScreen
              eyebrow="Saved Jobs"
              title="Loading your saved jobs"
              subtitle="Pulling the roles you bookmarked so they are ready when you are."
              sectionCount={1}
              cardsPerSection={3}
              minHeightClass="min-h-[50vh]"
              className="rounded-3xl"
            />
          ) : authStatus !== "authenticated" ? (
            <div className="rounded-3xl border border-border/60 bg-card/40 p-8 text-center backdrop-blur-xl">
              <h2 className="font-heading text-2xl font-bold text-foreground">
                Sign in to view your saved jobs
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Your saved roles are tied to your account so they stay available after
                refresh and across sessions.
              </p>

              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent("/saved-jobs")}`}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Sign in
                </Link>
                <Link
                  href="/jobs"
                  className="inline-flex items-center justify-center rounded-md border border-border/70 px-5 py-3 text-sm font-semibold text-foreground hover:bg-background/40"
                >
                  Browse jobs
                </Link>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
              Saved jobs error: {error}
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-3xl border border-border/60 bg-card/40 p-8 backdrop-blur-xl">
              <h2 className="font-heading text-2xl font-bold text-foreground">
                No saved jobs yet
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                Tap the bookmark icon on any job card to save it here for later.
              </p>

              <Link
                href="/jobs"
                className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Explore jobs
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {cards.length} saved job{cards.length === 1 ? "" : "s"}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Your shortlist stays in sync with the jobs you bookmark.
                  </div>
                </div>

                <Link
                  href="/jobs"
                  className="text-sm font-semibold text-primary hover:text-primary/90"
                >
                  Browse more jobs →
                </Link>
              </div>

              <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map(({ id, card }) => (
                  <li key={id}>
                    <JobCard
                      job={card}
                      isSaved
                      onApply={() => {
                        if (!card.id) return;
                        router.push(`/jobs/${encodeURIComponent(card.id)}`);
                      }}
                      onSavedChange={(saved) => {
                        if (!saved) {
                          setSavedJobs((current) =>
                            current.filter((job) => job.id !== id)
                          );
                        }
                      }}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>

      <LoginFooter />
      <AppliedJobsPopout buttonId="applied-jobs-popout-toggle-saved-jobs" />
    </>
  );
}
