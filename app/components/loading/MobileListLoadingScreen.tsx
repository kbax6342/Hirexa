import ListSectionSkeleton from "@/app/components/loading/ListSectionSkeleton";

type MobileListLoadingScreenProps = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  sectionCount?: number;
  cardsPerSection?: number;
  minHeightClass?: string;
  className?: string;
};

export default function MobileListLoadingScreen({
  eyebrow = "Live Results",
  title = "Loading fresh matches",
  subtitle = "Pulling in the newest roles for this view.",
  sectionCount = 2,
  cardsPerSection = 3,
  minHeightClass = "min-h-screen",
  className = "",
}: MobileListLoadingScreenProps) {
  return (
    <div
      className={`bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.08),_transparent_45%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_55%,_#f8fafc_100%)] ${minHeightClass} ${className}`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-start justify-center px-4 py-6 sm:px-6 sm:py-10">
        <div className="w-full rounded-[32px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-6">
          <div className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 ring-1 ring-sky-100">
            {eyebrow}
          </div>

          <div className="mt-4 max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              {subtitle}
            </p>
          </div>

          <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-sky-500" />
          </div>

          <ListSectionSkeleton
            className="mt-8"
            sectionCount={sectionCount}
            cardsPerSection={cardsPerSection}
          />
        </div>
      </div>
    </div>
  );
}
