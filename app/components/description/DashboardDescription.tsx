"use client";
import type { JobPretty } from "@/app/lib/jobs/types";

export function JobDescription({ pretty }: { pretty?: JobPretty | null }) {
  const safePretty: JobPretty = pretty ?? { sections: [], highlights: [] };

  return (
    <div className="space-y-6">
      {safePretty.highlights?.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {safePretty.highlights.map((h) => (
            <div
              key={h.label}
              className="rounded-xl border border-gray-200 bg-gray-50 p-4"
            >
              <div className="text-xs font-medium text-gray-500">{h.label}</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {h.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {safePretty.sections.map((s, idx) => (
        <section key={`${s.title}-${idx}`} className="space-y-3">
          <h3 className="text-base font-semibold text-gray-900">{s.title}</h3>

          {s.kind === "paragraphs" && (
            <div className="space-y-4">
                {s.paragraphs.map((t, i) => (
                <p key={i} className="text-sm leading-6 text-gray-700">
                    {t}
                </p>
                ))}
            </div>
)}

          {s.kind === "bullets" && (
            <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
              {s.bullets?.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}

          {s.kind === "callout" && s.callout && (
            <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
              {s.callout.label ? (
                <div className="font-semibold">{s.callout.label}</div>
              ) : null}
              <div>{s.callout.value}</div>
            </div>
          )}

          {s.kind === "smallprint" &&
            s.paragraphs?.map((p, i) => (
              <p key={i} className="text-xs leading-6 text-gray-500">
                {p}
              </p>
            ))}
        </section>
      ))}

      {/* Optional helpful empty state */}
      {!safePretty.sections.length ? (
        <div className="text-sm text-gray-500">Pick a job to see the full details.</div>
      ) : null}
    </div>
  );
}
