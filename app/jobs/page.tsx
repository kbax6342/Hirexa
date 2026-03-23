"use client";

import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import LoginFooter from "../components/loginFooter/LoginFooter";
import { Navbar } from "../components/navbar";
import Spinner from "../components/spinner/Spinner";

type JobCard = {
  id?: string;
  title: string;
  company: string;
  salary?: string;
  location: string;
  posted: string;
  jobUrl: string;
  url?: string;
  logoText?: string;
  logoUrl?: string;
  pill?: string;
};

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

function formatPostedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function JobCardItem({ job }: { job: JobCard }) {
  const router = useRouter();
  const salaryText = job.salary ?? job.pill;
  const applyUrl = job.jobUrl || job.url || "";

  function handleAiAssistantApply() {
    if (!applyUrl) return;

    const encodedUrl = encodeURIComponent(applyUrl);
    router.push(`/job-tools/ai-assistant/apply?jobUrl=${encodedUrl}`);
  }

  return (
    <div
      className="
        h-full
        rounded-2xl bg-white p-6
        shadow-sm ring-1 ring-slate-200
        transition hover:shadow-md hover:ring-slate-300
        flex flex-col
      "
    >
      <div>
        <button
          onClick={() => {
            sessionStorage.setItem("selectedJob", JSON.stringify(job));
            router.push(`/jobs/details`);
          }}
          className="block w-full text-left text-[15px] font-semibold text-slate-900 hover:underline line-clamp-2"
          title={job.title}
        >
          {job.title}
        </button>

        <div className="mt-2 text-sm text-slate-600 line-clamp-1">
          {job.company} • {job.location}
        </div>

        {salaryText ? (
          <div className="mt-3 inline-flex rounded-md bg-background/40 px-2.5 py-1 text-xs font-medium">
            {salaryText}
          </div>
        ) : (
          <div className="mt-3 h-6" />
        )}

        {job.posted ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <svg
              className="h-4 w-4 text-sky-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>

            <span className="line-clamp-1">
              Posted on: {formatPostedDate(job.posted)}
            </span>
          </div>
        ) : (
          <div className="mt-3 h-4" />
        )}
      </div>

      <div className="mt-auto pt-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAiAssistantApply}
            disabled={!applyUrl}
            className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            AI Assistant Apply
          </button>

          {applyUrl ? (
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Apply externally for ${job.title}`}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 p-3 text-slate-700 hover:bg-slate-100"
            >
              <ArrowTopRightOnSquareIcon className="h-5 w-5" />
            </a>
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center rounded-md border border-slate-200 p-3 text-slate-400"
            >
              <ArrowTopRightOnSquareIcon className="h-5 w-5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
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
  const [expandAllCategoriesSignal, setExpandAllCategoriesSignal] = useState(0);
  const [adzunaSections, setAdzunaSections] = useState<CategorySection[]>([]);
  const [adzunaLoading, setAdzunaLoading] = useState(true);
  const [adzunaError, setAdzunaError] = useState<string | null>(null);

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

            <section className="mt-8 rounded-2xl border border-border/60 bg-card/50 p-6 backdrop-blur-xl md:p-8">
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
              <Spinner label="Finding the best jobs for you..." />
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
                      {section.jobs.map((job) => (
                        <li key={job.id}>
                          <JobCardItem
                            job={{
                              id: job.id,
                              title: job.title,
                              company: job.company,
                              location: job.location,
                              posted: job.posted,
                              jobUrl: job.jobUrl,
                              salary: job.salary,
                              logoText: job.company?.[0]?.toUpperCase() ?? "•",
                            }}
                          />
                        </li>
                      ))}
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
