// File: app/components/jobs/AdzunaAttribution.tsx
/* eslint-disable @next/next/no-img-element */

type AdzunaAttributionProps = {
  className?: string;
  href?: string;
};

const DEFAULT_ADZUNA_HREF = "https://www.adzuna.com/";
const ADZUNA_WORDMARK_IMAGE =
  "https://qwdnuz3g8p1kfebz.public.blob.vercel-storage.com/Screenshot%202026-03-28%20012359.png";

export default function AdzunaAttribution({
  className,
  href = DEFAULT_ADZUNA_HREF,
}: AdzunaAttributionProps) {
  return (
    <div
      className={[
        "inline-flex min-h-[23px] min-w-[116px] items-center gap-1.5 text-sm text-slate-500",
        className ?? "",
      ].join(" ")}
    >
      <a
        href={href}
        className="font-medium text-slate-600 underline-offset-2 transition hover:text-slate-900 hover:underline"
      >
        Jobs
      </a>
      <span aria-hidden="true">by</span>
      <a
        href={href}
        aria-label="Adzuna"
        className="inline-flex min-h-[23px] items-center"
      >
        <img
          src={ADZUNA_WORDMARK_IMAGE}
          alt="Adzuna"
          width={94}
          height={24}
          className="h-6 w-auto"
          loading="lazy"
          decoding="async"
        />
      </a>
    </div>
  );
}
