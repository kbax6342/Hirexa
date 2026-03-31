"use client";

import { useMemo } from "react";
import type { JobDetail, JobPretty } from "@/app/lib/jobs/types";
import { extractCompanyLocationFromDescription } from "@/app/lib/jobs/pretty-from-text";
import {
  cleanJobListItem,
  cleanJobText,
  isJunkJobLine,
} from "@/app/lib/jobs/clean-job-text";
import {
  filterHiddenMetadataValues,
  isHiddenMetadataPair,
  isHiddenMetadataSectionTitle,
  isHiddenStandaloneMetadataValue,
} from "@/app/lib/jobs/formatJobText";
import { buildJobDetailBodyHtml } from "@/app/lib/jobs/detailContent";
import {
  formatAdzunaDescription,
  type FormattedAdzunaHighlight,
  type FormattedAdzunaSection,
} from "@/app/lib/jobs/formatAdzunaDescription";
import AdzunaAttribution from "@/app/components/jobs/AdzunaAttribution";
import JobDetailsSkeleton from "@/app/components/skeletons/JobDetailsSkeleton";

export type FormattedJob = {
  highlights?: FormattedAdzunaHighlight[];
  intro?: string[];
  sections: FormattedAdzunaSection[];
  salary?: string | null;
};

type JobDetailsPanelProps = {
  job: JobDetail | null;
  pretty: JobPretty;
  formatted: FormattedJob | null;
  detailsLoading: boolean;
  detailsError?: string | null;
  aiApplyLoading?: boolean;
  aiApplyDisabled?: boolean;
  aiApplyLabel?: string;
  aiApplyLoadingLabel?: string;
  onAiApply?: () => void;
  onCareerCoach?: () => void;
  onOutreach?: () => void;
  hideAiApplyOnDesktop?: boolean;
  hideAdzunaAttribution?: boolean;
};

function normalizeRenderedParagraph(value: string) {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isJunkJobLine(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRenderedBullets(values: string[]) {
  return values.map((value) => cleanJobListItem(String(value ?? ""))).filter(Boolean);
}

function BlueDotBulletList({ bullets }: { bullets: string[] }) {
  const cleanedBullets = normalizeRenderedBullets(bullets);

  if (cleanedBullets.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      {cleanedBullets.map((bullet, index) => (
        <div key={`${bullet}-${index}`} className="flex items-start gap-3">
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
          <span className="text-sm leading-relaxed text-gray-700">{bullet}</span>
        </div>
      ))}
    </div>
  );
}

function getVisibleDashboardHighlights<T extends { label: string; value: string }>(
  highlights: T[] | undefined
) {
  return (highlights ?? []).filter(
    (highlight) => !isHiddenMetadataPair(highlight.label, highlight.value)
  );
}

function getVisibleDashboardParagraphs(title: string, paragraphs: string[] | undefined) {
  return filterHiddenMetadataValues(
    title,
    (paragraphs ?? [])
      .map((paragraph) => normalizeRenderedParagraph(paragraph))
      .filter(Boolean)
      .filter((paragraph) => !isHiddenStandaloneMetadataValue(paragraph))
  );
}

function getVisibleDashboardBullets(title: string, bullets: string[] | undefined) {
  return filterHiddenMetadataValues(
    title,
    normalizeRenderedBullets(bullets ?? []).filter(
      (bullet) => !isHiddenStandaloneMetadataValue(bullet)
    )
  );
}

function getVisibleDashboardCalloutValue(title: string, value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (isHiddenStandaloneMetadataValue(normalized)) return null;
  if (isHiddenMetadataPair(title, normalized)) return null;
  return normalized;
}

function shouldHideDashboardSection(
  title: string,
  params: {
    paragraphs?: string[];
    bullets?: string[];
    calloutValue?: string | null;
  }
) {
  const visibleParagraphs = getVisibleDashboardParagraphs(title, params.paragraphs);
  const visibleBullets = getVisibleDashboardBullets(title, params.bullets);
  const visibleCalloutValue = getVisibleDashboardCalloutValue(
    title,
    params.calloutValue
  );

  if (
    isHiddenMetadataSectionTitle(title) &&
    visibleParagraphs.length === 0 &&
    visibleBullets.length === 0 &&
    !visibleCalloutValue
  ) {
    return true;
  }

  return false;
}

function sanitizeDashboardHtmlFallback(html: string) {
  return html
    .replace(
      /<(p|div|li|span|strong|em)>\s*Workplace\s*<\/\1>\s*<(p|div|li|span|strong|em)>\s*On(?:-| )?site\s*<\/\2>/gi,
      ""
    )
    .replace(
      /<(p|div|li|span|strong|em)>\s*Clearance\s*<\/\1>\s*<(p|div|li|span|strong|em)>\s*confidential\s*<\/\2>/gi,
      ""
    )
    .replace(/<(h[1-6]|p|div|li|span|strong|em)>\s*Workplace\s*<\/\1>/gi, "")
    .replace(/<(h[1-6]|p|div|li|span|strong|em)>\s*Clearance\s*<\/\1>/gi, "")
    .replace(/<(p|div|li|span|strong|em)>\s*On(?:-| )?site\s*<\/\1>/gi, "")
    .replace(/<(p|div|li|span|strong|em)>\s*confidential\s*<\/\1>/gi, "")
    .trim();
}

export default function JobDetailsPanel({
  job,
  pretty,
  formatted,
  detailsLoading,
  detailsError = null,
  aiApplyLoading = false,
  aiApplyDisabled = false,
  aiApplyLabel = "AI Assistant Apply",
  aiApplyLoadingLabel = "Opening...",
  onAiApply,
  onCareerCoach,
  onOutreach,
  hideAiApplyOnDesktop = false,
  hideAdzunaAttribution = false,
}: JobDetailsPanelProps) {
  const descriptionSource = String(job?.description ?? "");
  const parsedMeta = useMemo(
    () => extractCompanyLocationFromDescription(descriptionSource),
    [descriptionSource]
  );

  const displayCompany =
    job?.company && job.company !== "Unknown company"
      ? job.company
      : parsedMeta.company ?? "Unknown company";

  const displayLocation =
    job?.location && job.location !== "Unknown location"
      ? job.location
      : parsedMeta.location ?? "Unknown location";

  const adzunaFormatted = useMemo(() => {
    if (job?.source !== "adzuna") {
      return null;
    }

    return formatAdzunaDescription(
      String(
        job.descriptionPlain ?? job.content ?? job.description ?? job.descriptionHtml ?? ""
      )
    );
  }, [job?.content, job?.description, job?.descriptionHtml, job?.descriptionPlain, job?.source]);

  const panelFormatted = useMemo<FormattedJob | null>(() => {
    if (adzunaFormatted) {
      return {
        highlights: adzunaFormatted.highlights,
        intro: adzunaFormatted.intro,
        sections: adzunaFormatted.sections,
        salary: job?.salaryText ?? job?.salary ?? null,
      };
    }

    return formatted;
  }, [adzunaFormatted, formatted, job?.salary, job?.salaryText]);

  const detailBodyHtml = useMemo(() => buildJobDetailBodyHtml(job), [job]);
  const sanitizedDetailBodyHtml = useMemo(
    () => (detailBodyHtml ? sanitizeDashboardHtmlFallback(detailBodyHtml) : ""),
    [detailBodyHtml]
  );

  const hasPanelFormattedContent = Boolean(
    panelFormatted &&
      (getVisibleDashboardHighlights(panelFormatted.highlights).length > 0 ||
        getVisibleDashboardParagraphs("Position Overview", panelFormatted.intro).length > 0 ||
        panelFormatted.sections.some(
          (section) =>
            !shouldHideDashboardSection(section.title, {
              paragraphs: section.paragraphs,
              bullets: section.bullets,
            }) &&
            (getVisibleDashboardParagraphs(section.title, section.paragraphs).length > 0 ||
              getVisibleDashboardBullets(section.title, section.bullets).length > 0)
        ) ||
        panelFormatted.salary)
  );

  const hasPrettyContent =
    getVisibleDashboardHighlights(pretty.highlights).length > 0 ||
    pretty.sections.some(
      (section) =>
        !shouldHideDashboardSection(section.title, {
          paragraphs: "paragraphs" in section ? section.paragraphs : undefined,
          bullets: section.kind === "bullets" ? section.bullets : undefined,
          calloutValue:
            section.kind === "callout" ? section.callout?.value : undefined,
        }) &&
        (getVisibleDashboardParagraphs(
          section.title,
          "paragraphs" in section ? section.paragraphs : undefined
        ).length > 0 ||
          getVisibleDashboardBullets(
            section.title,
            section.kind === "bullets" ? section.bullets : undefined
          ).length > 0 ||
          Boolean(
            section.kind === "callout"
              ? getVisibleDashboardCalloutValue(section.title, section.callout?.value)
              : null
          ))
    );

  const cleanedDetailDescription = useMemo(
    () =>
      cleanJobText(
        String(
          job?.descriptionPlain ?? job?.content ?? job?.description ?? job?.descriptionHtml ?? ""
        ),
        { source: job?.source ?? null }
      ),
    [job?.content, job?.description, job?.descriptionHtml, job?.descriptionPlain, job?.source]
  );

  const cleanedFallbackParagraphs = useMemo(
    () =>
      cleanedDetailDescription
        .split(/\n{2,}/)
        .map((paragraph) => normalizeRenderedParagraph(paragraph))
        .filter(Boolean),
    [cleanedDetailDescription]
  );

  const shouldUseHtmlFallback =
    !detailsLoading &&
    !hasPanelFormattedContent &&
    !hasPrettyContent &&
    !!sanitizedDetailBodyHtml &&
    job?.source !== "adzuna";

  const shouldUseCleanTextFallback =
    !detailsLoading &&
    !hasPanelFormattedContent &&
    !hasPrettyContent &&
    cleanedFallbackParagraphs.length > 0;

  const showMinimalFallback =
    !detailsLoading &&
    !hasPanelFormattedContent &&
    !shouldUseHtmlFallback &&
    !shouldUseCleanTextFallback;

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="shrink-0 border-b border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-gray-900">
          {job?.title ?? "Select a job"}
        </h2>

        <div className="mt-1 text-xs text-gray-600">
          <span className="font-medium text-gray-700">{displayCompany}</span>
          <> • {displayLocation}</>
        </div>

        {job?.source === "adzuna" && !hideAdzunaAttribution ? (
          <AdzunaAttribution className="mt-3" />
        ) : null}

        {(onAiApply || onCareerCoach || onOutreach) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {onAiApply ? (
              <button
                type="button"
                onClick={onAiApply}
                disabled={!job?.id || aiApplyLoading || aiApplyDisabled}
                className={[
                  "w-full rounded-lg bg-[#ed5c0e] px-3 py-2 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(237,92,14,0.24)] transition hover:bg-[#d6520d] hover:shadow-[0_10px_22px_rgba(237,92,14,0.3)] active:bg-[#c84d0c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(237,92,14,0.25)] sm:w-auto",
                  hideAiApplyOnDesktop ? "lg:hidden" : "",
                ].join(" ")}
              >
                {aiApplyLoading ? aiApplyLoadingLabel : aiApplyLabel}
              </button>
            ) : null}

            {onCareerCoach ? (
              <button
                type="button"
                onClick={onCareerCoach}
                className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-xs font-semibold text-[#374151] hover:bg-gray-50 sm:w-auto"
              >
                Career Coach
              </button>
            ) : null}

            {onOutreach ? (
              <button
                type="button"
                onClick={onOutreach}
                className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-xs font-semibold text-[#374151] hover:bg-gray-50 sm:w-auto"
              >
                Outreach Copilot
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {detailsLoading ? (
          <JobDetailsSkeleton />
        ) : detailsError ? (
          <section className="rounded-xl border border-red-200 bg-red-50 p-4">
            <h3 className="text-sm font-semibold text-red-900">Unable to load job details</h3>
            <p className="mt-2 text-sm leading-relaxed text-red-700">{detailsError}</p>
          </section>
        ) : panelFormatted && hasPanelFormattedContent ? (
          <div className="space-y-6">
            {getVisibleDashboardHighlights(panelFormatted.highlights).length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {getVisibleDashboardHighlights(panelFormatted.highlights).map((highlight) => (
                  <div
                    key={`${highlight.label}-${highlight.value}`}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {highlight.label}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {highlight.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {panelFormatted.salary &&
            !getVisibleDashboardHighlights(panelFormatted.highlights).some(
              (highlight) => highlight.label === "Compensation"
            ) ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <div className="text-xs font-semibold text-green-700">Compensation</div>
                <div className="mt-1 text-sm font-semibold text-green-900">
                  {panelFormatted.salary}
                </div>
              </div>
            ) : null}

            {Array.isArray(panelFormatted.intro) && panelFormatted.intro.length > 0 ? (
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-900">Position Overview</h3>
                <div className="mt-2 space-y-2">
                  {getVisibleDashboardParagraphs(
                    "Position Overview",
                    panelFormatted.intro
                  ).map((paragraph, index) => (
                    <p key={`intro-${index}`} className="text-sm leading-relaxed text-gray-700">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ) : null}

            {Array.isArray(panelFormatted.sections) && panelFormatted.sections.length > 0 ? (
              <div className="space-y-6">
                {panelFormatted.sections.map((section, index) => {
                  const visibleParagraphs = getVisibleDashboardParagraphs(
                    section.title,
                    section.paragraphs
                  );
                  const visibleBullets = getVisibleDashboardBullets(
                    section.title,
                    section.bullets
                  );

                  if (
                    shouldHideDashboardSection(section.title, {
                      paragraphs: section.paragraphs,
                      bullets: section.bullets,
                    }) ||
                    (visibleParagraphs.length === 0 && visibleBullets.length === 0)
                  ) {
                    return null;
                  }

                  return (
                    <section
                      key={`${section.title}-${index}`}
                      className="rounded-xl border border-gray-200 bg-white p-4"
                    >
                      <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>

                      {visibleParagraphs.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {visibleParagraphs.map((paragraph, paragraphIndex) => (
                            <p
                              key={`${section.title}-paragraph-${paragraphIndex}`}
                              className="text-sm leading-relaxed text-gray-700"
                            >
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      ) : null}

                      {visibleBullets.length > 0 ? (
                        <BlueDotBulletList bullets={visibleBullets} />
                      ) : null}
                    </section>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : hasPrettyContent ? (
          <div className="space-y-6">
            {getVisibleDashboardHighlights(pretty.highlights).length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {getVisibleDashboardHighlights(pretty.highlights).map((highlight) => (
                  <div
                    key={`${highlight.label}-${highlight.value}`}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {highlight.label}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {highlight.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="space-y-6">
              {pretty.sections.map((section, idx) => {
                const visibleParagraphs = getVisibleDashboardParagraphs(
                  section.title,
                  "paragraphs" in section ? section.paragraphs : undefined
                );
                const visibleBullets = getVisibleDashboardBullets(
                  section.title,
                  section.kind === "bullets" ? section.bullets : undefined
                );
                const visibleCalloutValue =
                  section.kind === "callout"
                    ? getVisibleDashboardCalloutValue(
                        section.title,
                        section.callout?.value
                      )
                    : null;

                if (
                  shouldHideDashboardSection(section.title, {
                    paragraphs: "paragraphs" in section ? section.paragraphs : undefined,
                    bullets: section.kind === "bullets" ? section.bullets : undefined,
                    calloutValue:
                      section.kind === "callout" ? section.callout?.value : undefined,
                  }) ||
                  (visibleParagraphs.length === 0 &&
                    visibleBullets.length === 0 &&
                    !visibleCalloutValue)
                ) {
                  return null;
                }

                return (
                  <section
                    key={`${section.title}-${idx}`}
                    className="rounded-xl border border-gray-200 bg-white p-4"
                  >
                    <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>

                    {visibleBullets.length > 0 ? (
                      <BlueDotBulletList bullets={visibleBullets} />
                    ) : null}

                    {visibleParagraphs.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {visibleParagraphs.map((paragraph, paragraphIndex) => (
                          <p
                            key={`${section.title}-${paragraphIndex}`}
                            className="text-sm leading-relaxed text-gray-700"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ) : null}

                    {section.kind === "callout" && visibleCalloutValue ? (
                      <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
                        {section.callout.label ? (
                          <span className="mr-2 font-semibold">{section.callout.label}</span>
                        ) : null}
                        <span>{visibleCalloutValue}</span>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        ) : shouldUseHtmlFallback ? (
          <div
            className="
              prose max-w-none
              text-gray-700
              prose-p:mb-4
              prose-p:leading-7
              prose-strong:text-gray-900
              prose-em:text-gray-700
              prose-ul:mb-5
              prose-ul:mt-3
              prose-ol:mb-5
              prose-ol:mt-3
              prose-li:mb-2
              prose-li:leading-7
              prose-li:marker:text-blue-500
              prose-h3:mb-3
              prose-h3:mt-8
              prose-h3:text-base
              prose-h3:font-semibold
              prose-a:text-blue-600
              prose-a:no-underline
              hover:prose-a:underline
            "
            dangerouslySetInnerHTML={{ __html: sanitizedDetailBodyHtml }}
          />
        ) : shouldUseCleanTextFallback ? (
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Job Description</h3>
            <div className="mt-3 space-y-3">
              {cleanedFallbackParagraphs.map((paragraph, index) => (
                <p
                  key={`clean-fallback-${index}`}
                  className="text-sm leading-relaxed text-gray-700"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ) : showMinimalFallback ? (
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Job Description</h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Open the original posting for the latest full description and application
              instructions.
            </p>
          </section>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
