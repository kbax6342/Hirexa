// File: /Hirexa/my-app/app/location-hub/page.tsx
import Link from "next/link";
import { Navbar } from "../components/navbar";
import { Footer } from "../components/footer";
import LocationSections from "../components/location-hub/LocationSections";
import LoginFooter from "../components/loginFooter/LoginFooter";

const trending = [
  "New York",
  "Pennsylvania",
  "Illinois",
  "Ohio",
  "Georgia",
  "North Carolina",
  "Michigan",
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
  M: [
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Montana",
  ],
  N: [
    "Nebraska",
    "Nevada",
    "New Hampshire",
    "New Jersey",
    "New Mexico",
    "New York",
    "North Carolina",
    "North Dakota",
  ],
  O: ["Ohio", "Oklahoma", "Oregon"],
  P: ["Pennsylvania"],
  R: ["Rhode Island"],
  S: ["South Carolina", "South Dakota"],
  T: ["Tennessee", "Texas"],
  U: ["Utah"],
  V: ["Vermont", "Virginia"],
  W: ["Washington", "West Virginia", "Wisconsin", "Wyoming"],
};

export default async function LocationHubPage() {
  return (
    <>
      <Navbar />

      <main className="relative">
        {/* Subtle top divider like homepage sections */}
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
              <span className="text-foreground">Locations</span>
            </div>

            {/* Heading */}
            <div className="mt-10">
              <div className="text-[11px] font-semibold tracking-wider text-accent ">
                LOCATION HUB
              </div>
              <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Find roles by state — fast
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                Browse trending locations, see fresh roles, and jump straight to
                the states you care about.
              </p>
            </div>

            {/* Trending (glass card) */}
            <section className="mt-8 rounded-2xl border border-border/60 bg-card/50 p-6 backdrop-blur-xl md:p-8">
              <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Trending locations
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Quick picks based on what people are exploring today.
                  </div>
                </div>

                <Link
                  href="/locations/all"
                  className="text-sm font-medium text-primary hover:text-primary/90"
                >
                  Browse all locations →
                </Link>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {trending.map((t) => (
                  <Link
                    key={t}
                    href={`/jobs/${encodeURIComponent(
                      t.toLowerCase().replace(/\s+/g, "-")
                    )}`}
                    className="
                      inline-flex items-center rounded-full
                      border border-border/70 bg-background/30
                      px-3 py-1.5 text-large font-medium
                      text-muted-foreground
                      transition-colors
                      hover:bg-background/50 hover:text-foreground
                    "
                  >
                    {t}
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Jobs sections (your existing dynamic component) */}
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="mb-6">
            <div className="text-[11px] font-semibold tracking-wider text-accent">
              LIVE JOBS
            </div>
            <h2 className="mt-2 font-heading text-2xl font-bold tracking-tight text-foreground">
              Popular states hiring right now
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Updated in real time from our job sources.
            </p>
          </div>

          <LocationSections states={["California", "Texas", "Florida"]} n={3} />

          {/* All locations (dark style) */}
          <section className="mt-12 rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-xl md:p-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold tracking-wider text-accent">
                  DIRECTORY
                </div>
                <h3 className="mt-2 font-heading text-xl font-bold text-foreground">
                  All locations
                </h3>
              </div>
              <Link
                href="/locations/all"
                className="text-sm font-medium text-primary hover:text-primary/90"
              >
                View full list →
              </Link>
            </div>

            <div className="mt-6 grid gap-8 sm:grid-cols-2 md:grid-cols-4">
              {Object.entries(allLocations).map(([letter, states]) => (
                <div key={letter}>
                  <div className="text-sm font-semibold text-foreground">
                    {letter}
                  </div>

                  <ul className="mt-3 space-y-2 text-sm">
                    {states.map((s) => (
                      <li key={s}>
                        <Link
                          href={`/jobs/${encodeURIComponent(
                            s.toLowerCase().replace(/\s+/g, "-")
                          )}`}
                          className="text-muted-foreground transition-colors hover:text-foreground hover:underline"
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
        </div>
      </main>

      <LoginFooter/>
    </>
  );
}
