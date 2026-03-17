"use client";

import type { JobDetail, JobPretty, JobPrettySection } from "@/app/lib/jobs/types";
import { buildJobDetailBodyHtml } from "@/app/lib/jobs/detailContent";

type StructuredJobDescriptionProps = {
  detail?: JobDetail | null;
  pretty?: JobPretty | null;
  emptyMessage?: string;
};

function renderSection(section: JobPrettySection, index: number) {
  const cardClass =
    section.kind === "smallprint"
      ? "rounded-2xl border border-slate-200/80 bg-slate-50 px-5 py-4"
      : section.kind === "callout"
        ? "rounded-2xl border border-sky-200 bg-sky-50/80 px-5 py-4"
        : "rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]";

  return (
    <section key={`${section.title}-${index}`} className={cardClass}>
      <h3
        className={
          section.kind === "smallprint"
            ? "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
            : "text-sm font-semibold text-slate-900 sm:text-base"
        }
      >
        {section.title}
      </h3>

      {section.kind === "bullets" && section.bullets?.length ? (
        <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-slate-700 marker:text-sky-500">
          {section.bullets.map((bullet, bulletIndex) => (
            <li key={`${section.title}-${bulletIndex}`}>{bullet}</li>
          ))}
        </ul>
      ) : null}

      {"paragraphs" in section && section.paragraphs?.length ? (
        <div className="mt-4 space-y-3">
          {section.paragraphs.map((paragraph, paragraphIndex) => (
            <p
              key={`${section.title}-${paragraphIndex}`}
              className={
                section.kind === "smallprint"
                  ? "text-xs leading-6 text-slate-500"
                  : "text-sm leading-7 text-slate-700"
              }
            >
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}

      {section.kind === "callout" && section.callout ? (
        <div className="mt-4 rounded-xl bg-white/80 px-4 py-3 text-sm leading-7 text-sky-950 ring-1 ring-inset ring-sky-200/70">
          {section.callout.label ? (
            <span className="mr-2 font-semibold">{section.callout.label}</span>
          ) : null}
          <span>{section.callout.value}</span>
        </div>
      ) : null}
    </section>
  );
}

export default function StructuredJobDescription({
  detail,
  pretty,
  emptyMessage = "The full description is not available right now.",
}: StructuredJobDescriptionProps) {
  const safePretty: JobPretty = pretty ?? { sections: [], highlights: [] };
  const detailBodyHtml = detail ? buildJobDetailBodyHtml(detail) : null;
  const hasStructuredContent =
    safePretty.highlights.length > 0 || safePretty.sections.length > 0;

  if (!hasStructuredContent && !detailBodyHtml) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-sm leading-7 text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        {emptyMessage}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {safePretty.highlights.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {safePretty.highlights.map((highlight) => (
            <div
              key={`${highlight.label}-${highlight.value}`}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {highlight.label}
              </div>
              <div className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                {highlight.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {safePretty.sections.length > 0 ? (
        <div className="space-y-5">
          {safePretty.sections.map((section, index) => renderSection(section, index))}
        </div>
      ) : detailBodyHtml ? (
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
          <div
            className="
              prose max-w-none text-slate-700
              prose-p:mb-4 prose-p:leading-7
              prose-strong:text-slate-900
              prose-em:text-slate-700
              prose-ul:mb-5 prose-ul:mt-3
              prose-ol:mb-5 prose-ol:mt-3
              prose-li:mb-2 prose-li:leading-7 prose-li:marker:text-sky-500
              prose-h1:mb-3 prose-h1:mt-8 prose-h1:text-xl prose-h1:font-semibold prose-h1:text-slate-900
              prose-h2:mb-3 prose-h2:mt-8 prose-h2:text-lg prose-h2:font-semibold prose-h2:text-slate-900
              prose-h3:mb-3 prose-h3:mt-8 prose-h3:text-base prose-h3:font-semibold prose-h3:text-slate-900
              prose-blockquote:border-sky-200 prose-blockquote:bg-sky-50/70 prose-blockquote:px-4 prose-blockquote:py-3 prose-blockquote:text-slate-700
              prose-a:text-sky-700 prose-a:no-underline hover:prose-a:underline
            "
            dangerouslySetInnerHTML={{ __html: detailBodyHtml }}
          />
        </section>
      ) : null}
    </div>
  );
}
