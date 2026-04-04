type ListSectionSkeletonProps = {
  sectionCount?: number;
  cardsPerSection?: number;
  className?: string;
};

export default function ListSectionSkeleton({
  sectionCount = 2,
  cardsPerSection = 3,
  className = "",
}: ListSectionSkeletonProps) {
  return (
    <div className={className}>
      <div className="space-y-8">
        {Array.from({ length: sectionCount }).map((_, sectionIndex) => (
          <section key={sectionIndex} className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <SkeletonBlock className="h-6 w-40 rounded-full" />
              <SkeletonBlock className="h-5 w-24 rounded-full" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: cardsPerSection }).map((_, cardIndex) => (
                <article
                  key={cardIndex}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
                >
                  <div className="space-y-3">
                    <SkeletonBlock className="h-5 w-4/5 rounded-xl" />
                    <SkeletonBlock className="h-4 w-3/5 rounded-lg" />
                    <SkeletonBlock className="h-4 w-2/5 rounded-full" />
                    <SkeletonBlock className="h-4 w-1/3 rounded-lg" />
                  </div>

                  <div className="mt-6 flex items-center gap-3">
                    <SkeletonBlock className="h-11 flex-1 rounded-2xl" />
                    <SkeletonBlock className="h-11 w-11 rounded-2xl" />
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <style jsx global>{`
        @keyframes hirexa-list-shimmer {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(120%);
          }
        }
      `}</style>
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div className={`relative overflow-hidden bg-slate-200/80 ${className}`}>
      <span
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent)",
          animation: "hirexa-list-shimmer 1.35s ease-in-out infinite",
          transform: "translateX(-120%)",
        }}
      />
    </div>
  );
}
