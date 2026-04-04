import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import ExpandableLocations from "../components/location-hub/ExpandableLocations";
import LocationSections from "../components/location-hub/LocationSections";
import ListSectionSkeleton from "../components/loading/ListSectionSkeleton";
import LoginFooter from "../components/loginFooter/LoginFooter";
import { Navbar } from "../components/navbar";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
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
        <div className="border-b border-border/60">
          <div className="mx-auto max-w-7xl px-6 pb-10 pt-[60]">
            <div className="mt-10">
              <div className="text-[11px] font-semibold tracking-wider text-accent">
                LOCATION HUB
              </div>
              <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Find roles by state - fast
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                Browse trending locations, see fresh roles, and jump straight to
                the states you care about.
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="flex flex-col gap-10">
            <section className="order-1 md:order-2">
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

              <Suspense
                fallback={<ListSectionSkeleton className="mt-10" sectionCount={3} />}
              >
                <LocationSections states={["California", "Texas", "Florida"]} n={3} />
              </Suspense>
            </section>

            <section className="order-2 rounded-2xl border border-border/60 bg-card/50 p-6 backdrop-blur-xl md:order-1 md:p-8">
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
                  Browse all locations &rarr;
                </Link>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {trending.map((location) => (
                  <Link
                    key={location}
                    href={`/jobs/${encodeURIComponent(
                      location.toLowerCase().replace(/\s+/g, "-")
                    )}`}
                    className="inline-flex items-center rounded-full border border-border/70 bg-background/30 px-3 py-1.5 text-large font-medium text-muted-foreground transition-colors hover:bg-background/50 hover:text-foreground"
                  >
                    {location}
                  </Link>
                ))}
              </div>
            </section>

            <section className="order-3">
              <ExpandableLocations allLocations={allLocations} />
            </section>
          </div>
        </div>
      </main>

      <LoginFooter />
    </>
  );
}
