"use client";

// app/jobs/page.tsx
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";


type JobCard = {
  id?: string;
  title: string;
  company: string;
  location: string;
  posted: string; // e.g. "Posted 2 days ago"
  jobUrl: string; // ✅ link to the job post
  logoText?: string; // fallback initial
  logoUrl?: string; // if found
  pill?: string; // e.g. "$79k - $131k / year"
};

type CategorySection = {
  name: string;
  viewAllHref: string; // link to your internal category page
  jobs: JobCard[];
};

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  jobUrl: string;
  logoText: string;
  description?: string;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
};

type JobA = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  jobUrl: string;
};

type CategorySectionA = {
  name: string;
  viewAllHref: string;
  jobs: JobA[];
};

type ApiResponse = {
  count?: number;
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

// ✅ RENAMED to avoid clashing with React state: [sections, setSections]
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
  {
    name: "Graphic Design",
    viewAllHref: "#",
    jobs: [
      {
        title: "Graphic Designer / Web Design &...",
        company: "Zgraph",
        location: "Daytona Beach, FL",
        posted: "Posted 30+ days ago",
        jobUrl: "#",
        logoUrl: "/placeholder-logo.png",
      },
      {
        title: "Graphic Design",
        company: "Hyve Solutions",
        location: "Fremont, California",
        posted: "Posted 1 day ago",
        jobUrl: "#",
        logoUrl: "/placeholder-logo.png",
      },
      {
        title: "Graphic Design Expert (SME) – ...",
        company: "Invisible Agency",
        location: "Austin, Texas",
        posted: "Posted 30+ days ago",
        jobUrl: "#",
        logoText: "I",
        pill: "$25 - $100 / hour",
      },
    ],
  },
  {
    name: "Writing",
    viewAllHref: "#",
    jobs: [
      {
        title: "Legal Research & Writing – ...",
        company: "Kubicki Draper",
        location: "Miami, FL",
        posted: "Posted 3 weeks ago",
        jobUrl: "#",
        logoUrl: "/placeholder-logo.png",
      },
      {
        title: "Tutor, Writing",
        company: "WSU Tech",
        location: "Wichita, KS",
        posted: "Posted 1 day ago",
        jobUrl: "#",
        logoText: "W",
        pill: "$17 / hour",
      },
      {
        title: "Business Writing Training...",
        company: "GD Resources",
        location: "Boston, MA",
        posted: "Posted 30+ days ago",
        jobUrl: "#",
        logoText: "G",
      },
    ],
  },
];

const az = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

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
const allCategories: Record<string, string[]> = CATEGORY_LIST.reduce(
  (acc, name) => {
    const letter = name[0].toUpperCase();
    (acc[letter] ??= []).push(name);
    return acc;
  },
  {} as Record<string, string[]>
);

// sort categories A→Z and within each letter
for (const k of Object.keys(allCategories)) {
  allCategories[k].sort((a, b) => a.localeCompare(b));
}

function Logo({ logoText, logoUrl }: { logoText?: string; logoUrl?: string }) {
  return (
    <div className="h-11 w-11 shrink-0 rounded-lg bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center overflow-hidden">
      {logoUrl ? (
        <Image src={logoUrl} alt="" width={44} height={44} className="h-full w-full object-cover" />
      ) : (
        <span className="text-lg font-semibold text-slate-700">{logoText ?? "•"}</span>
      )}
    </div>
  );
}

function JobCardItem({ job }: { job: JobCard }) {
  const router = useRouter();
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <Logo logoText={job.logoText} logoUrl={job.logoUrl} />
          <div className="min-w-0 flex-1">
            <button
              onClick={() => {
                console.log("storing job", job);
                sessionStorage.setItem("selectedJob", JSON.stringify(job));
                router.push(`/jobs/details`);
              }}
              className="block font-semibold text-slate-900 hover:underline truncate"
              title={job.title}
            >
              {job.title}
            </button>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                {job.company}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                {job.location}
              </span>
            </div>

            {job.pill && (
              <div className="mt-3">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                  {job.pill}
                </span>
              </div>
            )}

            <div className="mt-4 text-xs text-slate-500">{job.posted}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ section }: { section: CategorySection }) {
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-slate-900">{section.name}</h2>
        <Link
          href={section.viewAllHref}
          className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
        >
          See all {section.name} jobs →
        </Link>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {section.jobs.map((job, idx) => (
          <JobCardItem key={`${section.name}-${idx}`} job={job} />
        ))}
      </div>
    </section>
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

  // ✅ If URL hash is #all-categories, expand automatically
  useEffect(() => {
    const expandIfAllCategoriesHash = () => {
      if (typeof window === "undefined") return;
      if (window.location.hash === "#all-categories") setShowAll(true);
    };

    expandIfAllCategoriesHash();
    window.addEventListener("hashchange", expandIfAllCategoriesHash);
    return () => window.removeEventListener("hashchange", expandIfAllCategoriesHash);
  }, []);

  // Show only A, B, C at first
  const defaultLetters = ["A", "B", "C"];
  const lettersToRender = showAll
    ? az.filter((l) => allCategories[l]?.length)
    : defaultLetters.filter((l) => allCategories[l]?.length);

  function jumpToLetter(letter: string) {
    setShowAll(true);
    requestAnimationFrame(() => {
      const el = document.getElementById(`cat-${letter}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold text-slate-900">All Job Categories</h2>

        <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
          {az.map((c) => {
            const hasCats = !!allCategories[c]?.length;

            return hasCats ? (
              <button
                key={c}
                type="button"
                onClick={() => jumpToLetter(c)}
                className="font-medium text-blue-700 hover:text-blue-800 hover:underline"
              >
                {c}
              </button>
            ) : (
              <span
                key={c}
                className="font-medium text-slate-300 cursor-not-allowed"
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
              <div className="text-lg font-semibold text-slate-900">{letter}</div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cats.map((cat) => (
                  <Link
                    key={cat}
                    href="#"
                    className="rounded-xl bg-white px-5 py-4 ring-1 ring-slate-200 hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-800">{cat}</span>
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
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
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

  // ✅ Adzuna categories sections (3 categories, 3 jobs each)
  const [adzunaSections, setAdzunaSections] = useState<CategorySectionA[]>([]);
  const [adzunaLoading, setAdzunaLoading] = useState(true);
  const [adzunaError, setAdzunaError] = useState<string | null>(null);

  // ✅ Your existing state (Workday + fallback)
  const [sectionsState, setSectionsState] = useState<CategorySection[]>([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [workdayError, setWorkdayError] = useState<string | null>(null);

  const router = useRouter();




  // ✅ Fetch ONE Workday job and render it as a nice “slot”
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadingSections(true);
        setWorkdayError(null);

        const res = await fetch("/api/jobs/workday?limit=1", { cache: "no-store" });
        const data: ApiResponse = await res.json();

        console.log("workday jobs API:", data);

        if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`);

        const first = Array.isArray(data.jobs) ? data.jobs[0] : null;

        const nextSections: CategorySection[] = [];

        if (first) {
          nextSections.push({
            name: "Latest from Workday",
            viewAllHref: "/jobs?src=workday", // internal for now
            jobs: [workdayJobToCard(first)],
          });
        }

        // ✅ Keep your old demo sections after the Workday slot
        nextSections.push(...fallbackSections);

        if (!cancelled) {
          setSectionsState(nextSections);
        }
      } catch (e: any) {
        console.error(e);
        if (!cancelled) {
          setWorkdayError(e?.message ?? "Failed to load Workday");
          // Still show the demo sections so your page never looks empty
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

    // ✅ Load Adzuna 3-category feed
  useEffect(() => {
    let cancelled = false;

    async function loadAdzuna() {
      try {
        setAdzunaLoading(true);
        setAdzunaError(null);

        // This calls your API that returns:
        // { sections: [{name, viewAllHref, jobs:[...3]} x3], generatedAt }
        const res = await fetch("/api/adzuna", { cache: "no-store" });
        const data: ApiSectionsResponse = await res.json();

        if (!res.ok) throw new Error(data?.error ?? `Adzuna request failed: ${res.status}`);

        if (!cancelled) setAdzunaSections(data.sections ?? []);
      } catch (e: any) {
        console.error(e);
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
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-6xl px-4 pb-16">
        {/* Breadcrumb */}
        <nav className="py-5 text-sm text-slate-600">
          <Link href="/" className="hover:underline text-blue-800 font-semibold underline">
            Home
          </Link>{" "}
          <span className="mx-2 text-slate-400">›</span>
          <span className="text-slate-700">All Job Categories</span>
        </nav>

        {/* Hero */}
        <section className="rounded-2xl bg-blue-50/60 ring-1 ring-blue-100 px-6 py-10">
          <h1 className="text-center text-2xl sm:text-3xl font-semibold text-slate-900">
            Jobs Search – Explore Careers Hiring Now Near You
          </h1>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {topPills.map((pill) => (
              <Link
                key={pill.name}
                href={pill.href}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                {pill.name}
              </Link>
            ))}
          </div>

          <div className="mt-6 text-center">
            <Link
              href="#all-categories"
              onClick={() => {
                setExpandAllCategoriesSignal((n) => n + 1);
                requestAnimationFrame(() => {
                  document.getElementById("all-categories")?.scrollIntoView({ behavior: "smooth" });
                });
              }}
              className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
            >
              Browse all categories
            </Link>
          </div>
        </section>

        {/* Optional Workday error banner (doesn’t change layout, just helpful) */}
        {!loadingSections && workdayError && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Workday feed error (showing fallback jobs): {workdayError}
          </div>
        )}

        {/* Sections */}
        {/* ✅ Render the 3 categories from Adzuna */}
        {!adzunaLoading && !adzunaError && adzunaSections.length > 0 && (
          <>
            {adzunaSections.map((section) => (
              <section key={section.name} className="mt-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold text-slate-900">{section.name}</h2>
                  <Link
                    href={section.viewAllHref}
                    className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
                  >
                    See all {section.name} jobs →
                  </Link>
                </div>

                <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {section.jobs.map((job) => (
                    <li key={job.id} className="rounded-xl bg-white ring-1 ring-slate-200 p-5">
                      <div className="font-semibold text-slate-900">{job.title}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        {job.company} • {job.location}
                      </div>

                      {job.jobUrl && (
                      //   <button
                      //   type="button"
                      //   onClick={() => {
                      //     sessionStorage.setItem("selectedJob", JSON.stringify(job));
                      //     router.push("/jobs/details");
                      //   }}
                      //   className="inline-block mt-2 text-blue-600 hover:underline font-medium"
                      // >
                      //   View job
                      // </button>
                      <Link
                        href={`/jobs/details/${job.id}`}
                        className="inline-block mt-2 text-blue-600 hover:underline font-medium"
                      >
                        View job
                      </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
        {/* All Job Categories */}
        <section id="all-categories" className="mt-14">
          <AllJobCategories allCategories={allCategories} expandSignal={expandAllCategoriesSignal} />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <div className="text-xl font-bold">Hirexa</div>
              <p className="mt-3 text-sm text-slate-600">Find jobs by category, location, and role.</p>
            </div>

            <FooterCol
              title="Product"
              links={[
                { name: "How it works", href: "#" },
                { name: "Fraud awareness", href: "#" },
              ]}
            />
            <FooterCol
              title="Company"
              links={[
                { name: "Blog", href: "#" },
                { name: "Terms & Conditions", href: "#" },
                { name: "Privacy Policy", href: "#" },
                { name: "CCPA/GDPR", href: "#" },
                { name: "Do not sell or share my information", href: "#" },
                { name: "Accessibility", href: "#" },
              ]}
            />
            <FooterCol
              title="Job Categories"
              links={[
                { name: "All Job Categories", href: "#" },
                { name: "Accounting Jobs", href: "#" },
                { name: "Customer Service Jobs", href: "#" },
                { name: "Data Science Jobs", href: "#" },
                { name: "Graphic Design Jobs", href: "#" },
                { name: "Healthcare Jobs", href: "#" },
              ]}
            />
            <div>
              <div className="text-sm font-semibold text-slate-900">Customer support</div>
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <div className="font-medium">(855) 965-3235</div>
                <div className="text-slate-600">
                  Mon–Fri 8AM–8PM CST
                  <br />
                  Sat 8AM–5PM CST
                  <br />
                  Sun 10AM–6PM CST
                </div>
                <Link href="mailto:customersupport@Hirexa.ai" className="block text-blue-700 hover:underline">
                  customersupport@Hirexa.ai
                </Link>
                <Link href="#" className="block text-blue-700 hover:underline">
                  Contact us
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500">
            Hirexa uses cookies and third-party affiliates. By using our website, you understand we collect personal
            data to improve your experience.
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { name: string; href: string }[];
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <ul className="mt-4 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.name}>
            <Link href={l.href} className="text-slate-700 hover:underline">
              {l.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
