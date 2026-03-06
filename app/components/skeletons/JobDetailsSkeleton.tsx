// my-app/app/components/skeletons/JobDetailsSkeleton.tsx
"use client";

import React from "react";

type Props = {
  leftLines?: number;
  rightLines?: number;
};

export default function JobDetailsSkeleton({
  leftLines = 10,
  rightLines = 16,
}: Props) {
  return (
    <div className="w-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4">
        <div className="h-8 w-20 rounded-full bg-slate-200/80 relative overflow-hidden">
          <Shimmer />
        </div>
        <div className="h-8 w-40 rounded-full bg-slate-200/80 relative overflow-hidden">
          <Shimmer />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 px-6 pb-10 md:grid-cols-2">
        {/* Left: list-ish */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-5 h-5 w-24 rounded bg-slate-200/80 relative overflow-hidden">
            <Shimmer />
          </div>

          <div className="space-y-3">
            {Array.from({ length: leftLines }).map((_, i) => (
              <SkeletonRow key={i} width={leftWidth(i)} />
            ))}
          </div>

          {/* Big pill button */}
          <div className="mt-7 h-11 w-full rounded-full bg-slate-200/80 relative overflow-hidden">
            <Shimmer />
          </div>
        </section>

        {/* Right: job details */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          {/* Header block */}
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-slate-200/80 relative overflow-hidden">
              <Shimmer />
            </div>
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-slate-200/80 relative overflow-hidden">
                <Shimmer />
              </div>
              <div className="h-4 w-1/2 rounded bg-slate-200/80 relative overflow-hidden">
                <Shimmer />
              </div>
            </div>
          </div>

          {/* Meta lines */}
          <div className="mt-5 space-y-2">
            <div className="h-3 w-1/3 rounded bg-slate-200/80 relative overflow-hidden">
              <Shimmer />
            </div>
            <div className="h-3 w-1/2 rounded bg-slate-200/80 relative overflow-hidden">
              <Shimmer />
            </div>
            <div className="h-3 w-2/5 rounded bg-slate-200/80 relative overflow-hidden">
              <Shimmer />
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 h-px w-full bg-slate-200" />

          {/* Body rows */}
          <div className="space-y-3">
            {Array.from({ length: rightLines }).map((_, i) => (
              <SkeletonRow key={i} width={rightWidth(i)} heightClass="h-3" />
            ))}
          </div>
        </section>
      </div>

      {/* Local keyframes (no config needed) */}
      <style jsx global>{`
        @keyframes hx-shimmer {
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

function SkeletonRow({
  width,
  heightClass = "h-4",
}: {
  width: string;
  heightClass?: string;
}) {
  return (
    <div className={`${heightClass} ${width} rounded bg-slate-200/80 relative overflow-hidden`}>
      <Shimmer />
    </div>
  );
}

function Shimmer() {
  return (
    <span
      className="absolute inset-0"
      style={{
        background:
          "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
        animation: "hx-shimmer 1.35s ease-in-out infinite",
        transform: "translateX(-120%)",
      }}
    />
  );
}

// widths that feel “text-like”
function leftWidth(i: number) {
  const widths = ["w-[92%]", "w-[88%]", "w-[80%]", "w-[86%]", "w-[70%]", "w-[84%]"];
  return widths[i % widths.length];
}
function rightWidth(i: number) {
  const widths = ["w-[96%]", "w-[92%]", "w-[88%]", "w-[94%]", "w-[84%]", "w-[90%]"];
  return widths[i % widths.length];
}