// app/location-hub/page.tsx
import Link from "next/link";
import { headers } from "next/headers";
import LocationSections from "../components/location-hub/LocationSections";

type JobCard = {
  title: string;
  company: string;
  location: string;
  pill?: string;
  posted?: string;
  description?: string;
  logoText: string; // fallback letter
  logoBg?: string; // tailwind class
};

type LocationSection = {
  name: string;
  href: string;
  jobs: JobCard[];
};

const trending = [
  "New York",
  "Pennsylvania",
  "Illinois",
  "Ohio",
  "Georgia",
  "North Carolina",
  "Michigan",
];

const sections: LocationSection[] = [
  {
    name: "California",
    href: "/jobs/california",
    jobs: [
      {
        title: "Fabrication Director — Treehouse",
        company: "Treehouse",
        location: "Los Angeles, CA",
        pill: "$120,000 – $184,000 / year",
        posted: "Posted today",
        description:
          "We’re a brand experience and production agency dedicated to building ideas rooted in culture...",
        logoText: "T",
        logoBg: "bg-black",
      },
      {
        title: "Project Coordinator — Treehouse",
        company: "Treehouse",
        location: "Los Angeles, CA",
        pill: "$22 – $26 / hour",
        posted: "Posted today",
        description:
          "We’re a brand experience and production agency dedicated to building ideas rooted in culture...",
        logoText: "T",
        logoBg: "bg-black",
      },
      {
        title: "Nurse Practitioner — California",
        company: "Core",
        location: "Sacramento, CA",
        pill: "$50 – $100 / hour",
        posted: "Posted today",
        description:
          "A third heart, we’re on a mission to revolutionize healthcare for women at midlife...",
        logoText: "C",
        logoBg: "bg-orange-500",
      },
    ],
  },
  {
    name: "Texas",
    href: "/jobs/texas",
    jobs: [
      {
        title: "Site Autonomy Manager",
        company: "May Mobility",
        location: "Arlington, TX",
        posted: "Posted today",
        description:
          "May Mobility is transforming cities through autonomous technology to create a safer, greener world...",
        logoText: "M",
        logoBg: "bg-green-600",
      },
      {
        title: "Assistant Store Manager",
        company: "Tecovas",
        location: "Dallas, TX",
        pill: "$24 – $32 / hour",
        posted: "Posted today",
        description:
          "Tecovas is passionate about offering an incredible customer experience for first-time boot buyers...",
        logoText: "T",
        logoBg: "bg-white",
      },
      {
        title: "Account Executive",
        company: "Snap! Mobile",
        location: "Fort Worth, TX",
        posted: "Posted today",
        description:
          "Supporting athletics and activities programs around the country with fundraising...",
        logoText: "S",
        logoBg: "bg-emerald-600",
      },
    ],
  },
  {
    name: "Florida",
    href: "/jobs/florida",
    jobs: [
      {
        title: "Account Executive",
        company: "Snap! Mobile",
        location: "Fort Lauderdale, FL",
        pill: "$40,000 – $175,000 / year",
        posted: "Posted today",
        description:
          "Snap! Mobile supports athletics and activities programs through modern fundraising tools...",
        logoText: "S",
        logoBg: "bg-emerald-600",
      },
      {
        title: "Account Executive",
        company: "Snap! Mobile",
        location: "Orlando, FL",
        pill: "$40,000 – $175,000 / year",
        posted: "Posted today",
        description:
          "Join a team helping schools and organizations fund programs with an easy-to-use platform...",
        logoText: "S",
        logoBg: "bg-emerald-600",
      },
      {
        title: "Senior Business Development…",
        company: "Triumvirate Environmental",
        location: "Miami, FL",
        posted: "Posted today",
        description:
          "Senior Business Development Manager. Are you a results-driven consultative sales professional...",
        logoText: "▲",
        logoBg: "bg-gray-100",
      },
    ],
  },
];

const allLocations: Record<string, string[]> = {
  A: ["Alabama", "Alaska", "Arizona", "Arkansas"],
  C: ["California", "Colorado", "Connecticut"],
  D: ["Delaware"],
  F: ["Florida"],
  G: ["Georgia"],
  H: ["Hawaii"],
  I: ["Idaho", "Illinois", "Indiana", "Iowa"],
  K: ["Kansas", "Kentucky"],
  L: ["Louisiana"],
  M: ["Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana"],
  N: ["Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota"],
  O: ["Ohio", "Oklahoma", "Oregon"],
  P: ["Pennsylvania"],
  R: ["Rhode Island"],
  S: ["South Carolina", "South Dakota"],
  T: ["Tennessee", "Texas"],
  U: ["Utah"],
  V: ["Vermont", "Virginia"],
  W: ["Washington", "West Virginia", "Wisconsin", "Wyoming"],
};



function JobCard({ job }: { job: JobCard }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <Logo text={job.logoText} bg={job.logoBg} />
        <div className="min-w-0 flex-1">
          <Link
            href="#"
            className="block truncate text-sm font-semibold text-gray-900 hover:underline"
          >
            {job.title}
          </Link>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <span className="font-medium text-gray-600">{job.company}</span>
            <span className="text-gray-300">•</span>
            <span>{job.location}</span>
          </div>

          {job.pill ? (
            <div className="mt-2 inline-flex rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
              {job.pill}
            </div>
          ) : null}

          {job.description ? (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-600">
              {job.description}
            </p>
          ) : null}

          {job.posted ? (
            <div className="mt-3 text-[11px] text-gray-400">{job.posted}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}



  
  function Logo({ text }: { text: string }) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-900 text-sm font-semibold text-white">
        {text}
      </div>
    );
  }

export default async function LocationHubPage() {
    
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Top Nav */}
     

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        {/* Breadcrumb */}
        <div className="text-xs text-gray-500">
        <Link href="/" className="hover:underline text-blue-800 font-semibold underline">
            Home
          </Link>{" "}
          <span className="mx-1">›</span>
          <span className="text-gray-700">Location Hub</span>
        </div>

        {/* Trending locations card */}
        <section className="mt-5 rounded-xl bg-indigo-50/60 px-6 py-10">
          <h1 className="text-center text-lg font-semibold text-gray-900">
            Trending locations
          </h1>

          <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-3">
            {trending.map((t) => (
              <button
                key={t}
                className="rounded-full bg-white px-4 py-2 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
                type="button"
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/locations/all"
              className="text-xs font-medium text-indigo-700 hover:underline"
            >
              Browse all locations
            </Link>
          </div>
        </section>

        {/* Location sections */}
          {/* ✅ Dynamic Adzuna sections */}
          <LocationSections
          states={["California", "Texas", "Florida"]}
          n={3}
        />

        {/* All locations */}
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-gray-900">All locations</h2>

          <div className="mt-6 grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            {Object.entries(allLocations).map(([letter, states]) => (
              <div key={letter}>
                <div className="text-sm font-semibold text-gray-900">{letter}</div>
                <ul className="mt-3 space-y-2 text-sm">
                  {states.map((s) => (
                    <li key={s}>
                      <Link
                        href={`/jobs/${encodeURIComponent(s.toLowerCase().replace(/\s+/g, "-"))}`}
                        className="text-indigo-700 hover:underline"
                      >
                        {s}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="text-lg font-semibold">Hirexa</div>

          <div className="mt-8 grid gap-10 md:grid-cols-5">
            <div className="space-y-3 text-sm">
              <div className="font-semibold text-gray-900">Product</div>
              <Link className="block text-gray-600 hover:text-gray-900" href="/how-it-works">
                How it works
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/fraud-awareness">
                Fraud Awareness
              </Link>
            </div>

            <div className="space-y-3 text-sm">
              <div className="font-semibold text-gray-900">Company</div>
              <Link className="block text-gray-600 hover:text-gray-900" href="/blog">
                Blog
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/terms">
                Terms &amp; Conditions
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/privacy">
                Privacy Policy
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/accessibility">
                Accessibility
              </Link>
            </div>

            <div className="space-y-3 text-sm">
              <div className="font-semibold text-gray-900">Job Categories</div>
              <Link className="block text-gray-600 hover:text-gray-900" href="/jobs">
                All Job Categories
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/jobs/accounting">
                Accounting Jobs
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/jobs/customer-service">
                Customer Service Jobs
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/jobs/data-science">
                Data Science Jobs
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/jobs/graphic-design">
                Graphic Design Jobs
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/jobs/healthcare">
                Healthcare Jobs
              </Link>
            </div>

            <div className="space-y-3 text-sm">
              <div className="font-semibold text-gray-900">More Jobs</div>
              <Link className="block text-gray-600 hover:text-gray-900" href="/jobs/legal">
                Legal Jobs
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/jobs/marketing">
                Marketing Jobs
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/jobs/nursing">
                Nursing Jobs
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/jobs/project-manager">
                Project Manager Jobs
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/jobs/sales">
                Sales Jobs
              </Link>
              <Link className="block text-gray-600 hover:text-gray-900" href="/locations">
                All Job Locations
              </Link>
            </div>

            <div className="space-y-3 text-sm">
              <div className="font-semibold text-gray-900">Customer support</div>
              <div className="text-gray-600">
                <div className="font-medium text-gray-800">855-605-2335</div>
                <div className="mt-1 text-xs text-gray-500">
                  Mon–Fri 8 AM – 8 PM CST
                  <br />
                  Sat 8 AM – 5 PM CST
                  <br />
                  Sun 10 AM – 6 PM CST
                </div>
              </div>
              <Link className="block text-gray-600 hover:text-gray-900" href="/contact">
                Contact us
              </Link>
            </div>
          </div>

          <div className="mt-10 text-xs text-gray-400">
            © {new Date().getFullYear()} Bold Limited. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
