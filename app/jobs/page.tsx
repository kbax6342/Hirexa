"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import JobCard, {
  resolveSavedJobId,
  type JobCardData,
} from "../components/jobs/JobCard";
import LoginFooter from "../components/loginFooter/LoginFooter";
import { Navbar } from "../components/navbar";
import MobileListLoadingScreen from "../components/loading/MobileListLoadingScreen";

type CategorySection = {
  name: string;
  viewAllHref: string;
  jobs: {
    id: string;
    title: string;
    company: string;
    salary?: string;
    location: string;
    posted: string;
    jobUrl: string;
  }[];
};

type ApiSectionsResponse = {
  sections?: CategorySection[];
  generatedAt?: string;
  error?: string;
};

type SavedJobsListResponse = {
  jobs?: Array<{
    jobId: string;
  }>;
  error?: string;
};

const topPills = [
  "Customer Service",
  "Nursing",
  "Accounting",
  "Sales",
  "Legal",
  "UX Design",
  "Healthcare",
] as const;

const CATEGORY_LIST = [
  "Accounting",
  "Actor",
  "Agriculture",
  "Airport",
  "Art",
  "Banking",
  "Billing",
  "Biology",
  "Business Administration",
  "Cashier",
  "Childcare",
  "Coaching",
  "Communications",
  "Compliance",
  "Computer Science",
  "Computer Software",
  "Construction",
  "Counseling",
  "Criminal Justice",
  "Customer Service",
  "Custodian",
  "Data Entry",
  "Data Science",
  "Dental Assistant",
  "Devops",
  "Driver",
  "Education",
  "Electrical",
  "Engineering",
  "Entertainment",
  "Esports",
  "Exercise Science",
  "Finance",
  "Fitness",
  "Food Service",
  "Game Tester",
  "Government",
  "Graphic Design",
  "Healthcare",
  "Healthcare Support",
  "Higher Education",
  "Hotel",
  "Housekeeping",
  "HR",
  "Hvac",
  "Information Technology",
  "Insurance",
  "Inventory",
  "Law Enforcement",
  "Landscaping",
  "Legal",
  "Management",
  "Marketing",
  "Masonry",
  "Medical",
  "Military",
  "Music",
  "Non Profit",
  "Nursing",
  "Nutrition",
  "Occupational Therapy",
  "Oil And Gas",
  "Oil Rig",
  "Operations Management",
  "Paralegal",
  "Payroll",
  "Pharmacy",
  "Photography",
  "Physical Therapy",
  "Post Office",
  "Product Management",
  "Program Manager",
  "Project Manager",
  "Psychiatry",
  "Psychologist",
  "Public Relations",
  "QA",
  "Radiology",
  "Real Estate",
  "Restaurant",
  "Retail",
  "Risk Management",
  "Roofing",
  "Safety",
  "Sales",
  "Salesforce",
  "Security",
  "Server",
  "Social Media",
  "Social Services",
  "Social Work",
  "Sports",
  "Staffing",
  "Statistics",
  "Store Manager",
  "Supply Chain",
  "Talent Acquisition",
  "Tax",
  "Teaching",
  "Tech",
  "Telework",
  "Trade",
  "Truck Driving",
  "Tutor",
  "Ui Ux Design",
  "Video Editing",
  "Warehouse",
  "Web Design",
  "Wildlife",
  "Writing",
  "Yoga",
] as const;

const allCategories: Record<string, string[]> = CATEGORY_LIST.reduce((acc, name) => {
  const letter = name[0].toUpperCase();
  (acc[letter] ??= []).push(name);
  return acc;
}, {} as Record<string, string[]>);

for (const key of Object.keys(allCategories)) {
  allCategories[key].sort((a, b) => a.localeCompare(b));
}

function categoryToSlug(category: string) {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

function categoryHref(category: string) {
  return `/jobs/${categoryToSlug(category)}`;
}

function mapSectionJobToCard(job: CategorySection["jobs"][number]): JobCardData {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    posted: job.posted,
    jobUrl: job.jobUrl,
    salary: job.salary,
    logoText: job.company?.[0]?.toUpperCase() ?? "•",
  };
}

function AllJobCategories({
  allCategories,
  expandSignal,
}: {
  allCategories: Record<string, string[]>;
  expandSignal: number;
}) {
  const az = useMemo(() => "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), []);
  const [showAll, setShowAll] = useState(false);
  const isExpanded = showAll || expandSignal > 0;

  useEffect(() => {
    const expandIfAllCategoriesHash = () => {
      if (typeof window === "undefined") return;
      if (window.location.hash === "#all-categories") setShowAll(true);
    };

    expandIfAllCategoriesHash();
    window.addEventListener("hashchange", expandIfAllCategoriesHash);
    return () => window.removeEventListener("hashchange", expandIfAllCategoriesHash);
  }, []);

  const defaultLetters = ["A", "B", "C"];
  const lettersToRender = isExpanded
    ? az.filter((letter) => allCategories[letter]?.length)
    : defaultLetters.filter((letter) => allCategories[letter]?.length);

  function jumpToLetter(letter: string) {
    setShowAll(true);
    requestAnimationFrame(() => {
      document
        .getElementById(`cat-${letter}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-xl sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-2xl font-bold text-foreground">
          All Job Categories
        </h2>

        <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
          {az.map((letter) => {
            const hasCategories = Boolean(allCategories[letter]?.length);

            return hasCategories ? (
              <button
                key={letter}
                type="button"
                onClick={() => jumpToLetter(letter)}
                className="font-medium text-primary hover:text-primary/90 hover:underline"
              >
                {letter}
              </button>
            ) : (
              <span
                key={letter}
                className="cursor-not-allowed font-medium text-muted-foreground/40"
                title="No categories"
              >
                {letter}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-8 space-y-10">
        {lettersToRender.map((letter) => {
          const categories = allCategories[letter] ?? [];
          return (
            <div key={letter} id={`cat-${letter}`}>
              <div className="text-lg font-semibold text-foreground">{letter}</div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {categories.map((category) => (
                  <Link
                    key={category}
                    href={categoryHref(category)}
                    className="rounded-xl border border-border/60 bg-background/20 px-5 py-4 text-muted-foreground transition hover:bg-background/30 hover:text-foreground"
                  >
                    <span className="font-medium">{category}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {!isExpanded && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded-full border border-border/60 bg-background/20 px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-background/30"
          >
            Show all categories
          </button>
        </div>
      )}
    </div>
  );
}

export default function JobsPage() {
  const { status: authStatus } = useSession();
  const [expandAllCategoriesSignal, setExpandAllCategoriesSignal] = useState(0);
  const [adzunaSections, setAdzunaSections] = useState<CategorySection[]>([]);
  const [adzunaLoading, setAdzunaLoading] = useState(true);
  const [adzunaError, setAdzunaError] = useState<string | null>(null);
  const [savedJobs, setSavedJobs] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadAdzuna() {
      try {
        setAdzunaLoading(true);
        setAdzunaError(null);

        const res = await fetch("/api/adzuna", { cache: "no-store" });
        const data: ApiSectionsResponse = await res.json();

        if (!res.ok) {
          throw new Error(data?.error ?? `Adzuna request failed: ${res.status}`);
        }

        if (!cancelled) {
          setAdzunaSections(data.sections ?? []);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setAdzunaError(
            error instanceof Error
              ? error.message
              : "Failed to load Adzuna categories"
          );
        }
      } finally {
        if (!cancelled) {
          setAdzunaLoading(false);
        }
      }
    }

    loadAdzuna();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedJobs() {
      try {
        const response = await fetch("/api/saved-jobs/list", {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as SavedJobsListResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load saved jobs.");
        }

        if (!cancelled) {
          setSavedJobs((data.jobs ?? []).map((job) => job.jobId));
        }
      } catch {
        if (!cancelled) {
          setSavedJobs([]);
        }
      }
    }

    if (authStatus !== "authenticated") {
      setSavedJobs([]);
      return;
    }

    void loadSavedJobs();

    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  return (
    <>
      <Navbar />

      <main className="relative">
        <div className="border-b border-border/60">
          <div className="mx-auto max-w-7xl px-6 pb-10 pt-10">
            <div className="text-xs text-muted-foreground">
              <Link
                href="/"
                className="font-medium text-foreground/80 hover:text-foreground hover:underline"
              >
                Home
              </Link>{" "}
              <span className="mx-1 opacity-60">›</span>
              <span className="text-foreground">Job Categories</span>
            </div>

            <div className="mt-10">
              <div className="text-[11px] font-semibold tracking-wider text-accent">
                JOB CATEGORIES
              </div>
              <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Jobs Search - Explore Careers Hiring Now Near You
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                Explore categories, view fresh roles, and jump straight into the
                jobs you want.
              </p>
            </div>

            <section
              className={`mt-8 rounded-2xl border border-border/60 bg-card/50 p-6 backdrop-blur-xl md:p-8 ${
                adzunaLoading ? "hidden md:block" : ""
              }`}
            >
              <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Trending categories
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Quick picks based on what people are exploring today.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setExpandAllCategoriesSignal((count) => count + 1);
                    requestAnimationFrame(() => {
                      document
                        .getElementById("all-categories")
                        ?.scrollIntoView({ behavior: "smooth" });
                    });
                  }}
                  className="text-sm font-medium text-primary hover:text-primary/90"
                >
                  Browse all categories →
                </button>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {topPills.map((pill) => (
                  <Link
                    key={pill}
                    href={categoryHref(pill)}
                    className="
                      inline-flex items-center gap-2 rounded-full
                      border border-border/70 bg-background/30
                      px-3 py-1.5 text-sm font-medium
                      text-muted-foreground
                      transition-colors
                      hover:bg-background/50 hover:text-foreground
                    "
                  >
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    {pill}
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-6 py-12">
          <section>
            {adzunaLoading ? (
              <MobileListLoadingScreen
                eyebrow="Job Categories"
                title="Loading fresh job sections"
                subtitle="Pulling live openings before we show you the trending categories."
                sectionCount={2}
                cardsPerSection={3}
                minHeightClass="min-h-[60vh]"
                className="rounded-3xl"
              />
            ) : adzunaError ? (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
                Adzuna feed error: {adzunaError}
              </div>
            ) : adzunaSections.length === 0 ? (
              <div className="rounded-xl border border-slate-200/40 bg-white/5 p-6 text-sm text-muted-foreground">
                No Adzuna categories returned yet.
              </div>
            ) : (
              <>
                {adzunaSections.map((section) => (
                  <section key={section.name} className="mt-10">
                    <div className="flex items-center justify-between">
                      <h2 className="font-heading text-2xl font-bold text-foreground">
                        {section.name}
                      </h2>

                      <Link
                        href={`/jobs/${categoryToSlug(section.name)}`}
                        className="text-sm font-semibold text-sky-600 hover:text-sky-700"
                      >
                        See all {section.name} jobs →
                      </Link>
                    </div>

                    <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {section.jobs.map((job) => {
                        const cardJob = mapSectionJobToCard(job);
                        const savedJobId = resolveSavedJobId(cardJob);

                        return (
                          <li key={job.id}>
                            <JobCard
                              job={cardJob}
                              isSaved={savedJobId ? savedJobs.includes(savedJobId) : false}
                              onSavedChange={(saved) => {
                                if (!savedJobId) return;

                                setSavedJobs((current) =>
                                  saved
                                    ? current.includes(savedJobId)
                                      ? current
                                      : [...current, savedJobId]
                                    : current.filter((jobId) => jobId !== savedJobId)
                                );
                              }}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </>
            )}
          </section>

          <section id="all-categories" className="mt-14">
            <AllJobCategories
              allCategories={allCategories}
              expandSignal={expandAllCategoriesSignal}
            />
          </section>
        </div>
      </main>

      <LoginFooter />
    </>
  );
}
