"use client";

import { useState } from "react";
import Link from "next/link";

type Props = {
  allLocations: Record<string, string[]>;
};

export default function ExpandableLocations({ allLocations }: Props) {
  const [expanded, setExpanded] = useState(false);

  const entries = Object.entries(allLocations);
  const visibleEntries = expanded ? entries : entries.slice(0, 4); // A–D only

  return (
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

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-sm font-medium text-primary hover:text-primary/90"
        >
          {expanded ? "Show less ↑" : "View full list →"}
        </button>
      </div>

      <div className="mt-6 grid gap-8 sm:grid-cols-2 md:grid-cols-4">
        {visibleEntries.map(([letter, states]) => (
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

      {!expanded && (
        <div className="mt-4 text-xs text-muted-foreground">
          Showing A–D · Click “View full list” to expand
        </div>
      )}
    </section>
  );
}
