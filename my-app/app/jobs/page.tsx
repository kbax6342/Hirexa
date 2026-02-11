// File: /Hirexa/my-app/app/jobs/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "../components/navbar";
import LoginFooter from "../components/loginFooter/LoginFooter";
import Spinner from "../components/spinner/Spinner"

type JobCard = {
  id?: string;
  title: string;
  company: string;
  salary?: string;
  location: string;
  posted: string;
  jobUrl: string;
  logoText?: string;
  logoUrl?: string;
  pill?: string;
};

type JobA = {
  id: string;
  title: string;
  company: string;
  salary?: string;
  location: string;
  posted: string;
  jobUrl: string;
};

type CategorySection = {
  name: string;
  viewAllHref: string;
  jobs: JobCard[];
};

type CategorySectionA = {
  name: string;
  viewAllHref: string;
  jobs: JobA[];
};

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  jobUrl: string;
  logoText: string;
};

type ApiResponse = {
  jobs?: Job[];
  error?: string;
};

type ApiSectionsResponse = {
  sections: CategorySectionA[];
  generatedAt?: string;
  error?: string;
};

const topPills = [
  { name: "Customer Service", href: "#" },
  { name: "Nursing", href: "#" },
  { name: "Accounting", href: "#" },
  { name: "Sales", href: "#" },
  { name: "Legal", href: "#" },
  { name: "UX Design", href: "#" },
  { name: "Healthcare", href: "#" },
];

const fallbackSections: CategorySection[] = [
  {
    name: "Marketing",
    viewAllHref: "#",
    jobs: [
      {
        title: "Marketing",
        company: "Skio",
        location: "New York or remote",
        posted: "Posted 30+ days ago",
        jobUrl: "#",
        logoUrl: "/placeholder-logo.png",
      },
      {
        title: "Marketing Officer / Digital Marketin...",
        company: "InfiniteWorldCour...",
        location: "Redmond, WA",
        posted: "Posted 1 week ago",
        jobUrl: "#",
        logoText: "I",
      },
      {
        title: "Marketing Director – Lead, Inspire,...",
        company: "Visiting Angels of Jenki...",
        location: "Jenkintown, PA",
        posted: "Posted 30+ days ago",
        jobUrl: "#",
        logoText: "V",
      },
    ],
  },
];

// Put ALL categories here (flat list)
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

// Auto-group by first letter
const allCategories: Record<string, string[]> = CATEGORY_LIST.reduce((acc, name) => {
  const letter = name[0].toUpperCase();
  (acc[letter] ??= []).push(name);
  return acc;
}, {} as Record<string, string[]>);

// sort categories A→Z and within each letter
for (const k of Object.keys(allCategories)) {
  allCategories[k].sort((a, b) => a.localeCompare(b));
}

function Logo({ logoText, logoUrl }: { logoText?: string; logoUrl?: string }) {
  return (
    <div className="h-11 w-11 shrink-0 rounded-lg bg-background/40 border border-border/60 flex items-center justify-center overflow-hidden">
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt=""
          width={44}
          height={44}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-lg font-semibold text-muted-foreground">
          {logoText ?? "•"}
        </span>
      )}
    </div>
  );
}

function categoryToSlug(category: string) {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

function formatPostedDate(value: string) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return value; // fallback if Adzuna sends text

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}


function JobCardItem({ job }: { job: JobCard }) {
  const router = useRouter();
  const salaryText = job.salary ?? job.pill;

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
      {/* Top content */}
      <div>
        {/* Title (clamp to keep heights consistent) */}
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

        {/* Company • Location */}
        <div className="mt-2 text-sm text-slate-600 line-clamp-1">
          {job.company} • {job.location}
        </div>

        {/* Salary pill */}
        {salaryText ? (
          <div className="mt-3 inline-flex rounded-md bg-background/40 px-2.5 py-1 text-xs font-medium text-">
            {salaryText}
          </div>
        ) : (
          // keeps spacing consistent even when no salary
          <div className="mt-3 h-6" />
        )}

       {/* Posted */}
      {job.posted ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          {/* calendar icon */}
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
            Posted on :  {formatPostedDate(job.posted)}
          </span>
        </div>
      ) : (
        <div className="mt-3 h-4" />
      )}

      </div>

      {/* Actions pinned to bottom */}
      <div className="mt-auto pt-5 flex items-center justify-between">
        <Link
          href={job.id ? `/jobs/details/${job.id}` : "/jobs/details"}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          View job
        </Link>

        {job.jobUrl ? (
          <a
            href={job.jobUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Open source →
          </a>
        ) : (
          <span className="text-sm text-transparent select-none">Open source →</span>
        )}
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

  useEffect(() => {
    if (expandSignal > 0) setShowAll(true);
  }, [expandSignal]);

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
  const lettersToRender = showAll
    ? az.filter((l) => allCategories[l]?.length)
    : defaultLetters.filter((l) => allCategories[l]?.length);

  function jumpToLetter(letter: string) {
    setShowAll(true);
    requestAnimationFrame(() => {
      document.getElementById(`cat-${letter}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-xl sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-2xl font-bold text-foreground">
          All Job Categories
        </h2>

        <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
          {az.map((c) => {
            const hasCats = !!allCategories[c]?.length;

            return hasCats ? (
              <button
                key={c}
                type="button"
                onClick={() => jumpToLetter(c)}
                className="font-medium text-primary hover:text-primary/90 hover:underline"
              >
                {c}
              </button>
            ) : (
              <span
                key={c}
                className="font-medium text-muted-foreground/40 cursor-not-allowed"
                title="No categories"
              >
                {c}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-8 space-y-10">
        {lettersToRender.map((letter) => {
          const cats = allCategories[letter] ?? [];
          return (
            <div key={letter} id={`cat-${letter}`}>
              <div className="text-lg font-semibold text-foreground">{letter}</div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cats.map((cat) => (
                  <Link
                    key={cat}
                    href="#"
                    className="rounded-xl border border-border/60 bg-background/20 px-5 py-4 text-muted-foreground hover:text-foreground hover:bg-background/30 transition"
                  >
                    <span className="font-medium">{cat}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {!showAll && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded-full border border-border/60 bg-background/20 px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-background/30 transition"
          >
            Show all categories
          </button>
        </div>
      )}
    </div>
  );
}

function workdayJobToCard(j: Job): JobCard {
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    posted: j.posted.startsWith("Posted") ? j.posted : `Posted ${j.posted}`,
    jobUrl: j.jobUrl,
    logoText: j.logoText ?? j.company?.[0]?.toUpperCase() ?? "•",
  };
}

export default function JobsPage() {
  const [expandAllCategoriesSignal, setExpandAllCategoriesSignal] = useState(0);

  const [adzunaSections, setAdzunaSections] = useState<CategorySectionA[]>([]);
  const [adzunaLoading, setAdzunaLoading] = useState(true);
  const [adzunaError, setAdzunaError] = useState<string | null>(null);

  const [sectionsState, setSectionsState] = useState<CategorySection[]>([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [workdayError, setWorkdayError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadingSections(true);
        setWorkdayError(null);

        const res = await fetch("/api/jobs/workday?limit=1", { cache: "no-store" });
        const data: ApiResponse = await res.json();

        if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`);

        const first = Array.isArray(data.jobs) ? data.jobs[0] : null;

        const nextSections: CategorySection[] = [];
        if (first) {
          nextSections.push({
            name: "Latest from Workday",
            viewAllHref: "/jobs?src=workday",
            jobs: [workdayJobToCard(first)],
          });
        }

        nextSections.push(...fallbackSections);

        if (!cancelled) setSectionsState(nextSections);
      } catch (e: any) {
        if (!cancelled) {
          setWorkdayError(e?.message ?? "Failed to load Workday");
          setSectionsState(fallbackSections);
        }
      } finally {
        if (!cancelled) setLoadingSections(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAdzuna() {
      try {
        setAdzunaLoading(true);
        setAdzunaError(null);

        const res = await fetch("/api/adzuna", { cache: "no-store" });
        const data: ApiSectionsResponse = await res.json();
        console.log(data)

        if (!res.ok) throw new Error(data?.error ?? `Adzuna request failed: ${res.status}`);

        if (!cancelled) setAdzunaSections(data.sections ?? []);
      } catch (e: any) {
        if (!cancelled) setAdzunaError(e?.message ?? "Failed to load Adzuna categories");
      } finally {
        if (!cancelled) setAdzunaLoading(false);
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
          <div className="mx-auto max-w-7xl px-6 pt-10 pb-10">
            {/* Breadcrumb */}
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

            {/* Heading */}
            <div className="mt-10">
              <div className="text-[11px] font-semibold tracking-wider text-accent">
                JOB CATEGORIES
              </div>
              <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Jobs Search – Explore Careers Hiring Now Near You
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                Explore categories, view fresh roles, and jump straight into the jobs you want.
              </p>
            </div>

            {/* Hero pill card (glass) */}
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
                    setExpandAllCategoriesSignal((n) => n + 1);
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
                    key={pill.name}
                    href={pill.href}
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
                    {pill.name}
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-6 py-12">
          {/* Optional Workday error banner */}
          {!loadingSections && workdayError && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
              Workday feed error (showing fallback jobs): {workdayError}
            </div>
          )}

         
          {/* Adzuna sections */}
          <section className="mt-10">
            {adzunaLoading ? (
              <Spinner label="Finding the best jobs for you…" />
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


          {/* All categories */}
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
