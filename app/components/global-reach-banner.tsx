"use client";

/* eslint-disable @next/next/no-img-element */

const countries = [
  {
    name: "United States",
    flag: "https://storage.googleapis.com/uxpilot-auth.appspot.com/2149771817-834edf1667794af04629.png",
  },
  {
    name: "United Kingdom",
    flag: "https://storage.googleapis.com/uxpilot-auth.appspot.com/2149771817-9ea407f42f57d8a20614.png",
  },
  {
    name: "Canada",
    flag: "https://storage.googleapis.com/uxpilot-auth.appspot.com/2149771817-0a10868182280cdaa617.png",
  },
  {
    name: "Australia",
    flag: "https://storage.googleapis.com/uxpilot-auth.appspot.com/2149771817-a6f9c7784859dde8642f.png",
  },
  {
    name: "France",
    flag: "https://storage.googleapis.com/uxpilot-auth.appspot.com/2149771817-2c73f44b38da0b3179a2.png",
  },
  {
    name: "Mexico",
    flag: "https://storage.googleapis.com/uxpilot-auth.appspot.com/2149771817-0c0ebe54b734963f8f87.png",
  },
  {
    name: "Chile",
    flag: "https://storage.googleapis.com/uxpilot-auth.appspot.com/2149771817-d980a7ac7a3937533d7f.png",
  },
  {
    name: "South Africa",
    flag: "https://storage.googleapis.com/uxpilot-auth.appspot.com/2149771817-d90483d4489ece4abd84.png",
  },
] as const;

function CountryChip({
  name,
  flag,
}: {
  name: string;
  flag: string;
}) {
  return (
    <div className="group flex min-w-max items-center gap-3 rounded-full border border-sky-400/15 bg-white/6 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:border-sky-300/35 hover:bg-sky-400/10">
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-white/15">
        <img
          src={flag}
          alt={`${name} flag`}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </span>
      <span className="text-sm font-medium text-white/90 transition duration-300 group-hover:text-white">
        {name}
      </span>
    </div>
  );
}

export function GlobalReachBanner() {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-sky-400/15 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_35%),linear-gradient(135deg,rgba(2,6,23,0.96),rgba(15,23,42,0.92))] px-5 py-6 shadow-[0_24px_80px_-36px_rgba(14,165,233,0.5)] sm:px-7 sm:py-7">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/50 to-transparent" />
      <div className="pointer-events-none absolute -left-16 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-12 top-1/2 h-36 w-36 -translate-y-1/2 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-sky-200/80">
          Global Reach, Local Impact: Countries we serve
        </p>

        <div className="global-reach-marquee relative mt-5 overflow-hidden">
          <div className="global-reach-track flex w-max items-center gap-4 pr-4">
            <div className="flex items-center gap-4">
              {countries.map((country) => (
                <CountryChip key={country.name} name={country.name} flag={country.flag} />
              ))}
            </div>
            <div className="flex items-center gap-4" aria-hidden="true">
              {countries.map((country) => (
                <CountryChip
                  key={`${country.name}-clone`}
                  name={country.name}
                  flag={country.flag}
                />
              ))}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent sm:w-20" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-slate-950 via-slate-950/80 to-transparent sm:w-20" />
        </div>
      </div>

      <style jsx>{`
        .global-reach-track {
          animation: global-reach-marquee 28s linear infinite;
          will-change: transform;
        }

        .global-reach-marquee:hover .global-reach-track {
          animation-play-state: paused;
        }

        @keyframes global-reach-marquee {
          from {
            transform: translate3d(0, 0, 0);
          }

          to {
            transform: translate3d(-50%, 0, 0);
          }
        }
      `}</style>
    </div>
  );
}
