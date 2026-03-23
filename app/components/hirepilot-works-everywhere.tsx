import {
  BoltIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentIcon,
  ComputerDesktopIcon,
  LightBulbIcon,
  MicrophoneIcon,
  PlayCircleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const floatingPlatforms = [
  {
    name: "Zoom",
    accentClassName: "bg-sky-400",
    className: "-left-2 top-16 xl:-left-8",
  },
  {
    name: "Google Meet",
    accentClassName: "bg-emerald-400",
    className: "left-10 bottom-8 xl:-left-2",
  },
  {
    name: "Microsoft Teams",
    accentClassName: "bg-violet-400",
    className: "right-8 top-10 xl:-right-6",
  },
  {
    name: "HackerRank",
    accentClassName: "bg-lime-400",
    className: "right-0 bottom-20 xl:-right-4",
  },
];

const topFeaturePills = [
  "Real-time interview listening",
  "AI generated answer suggestions",
];

const workflowItems = [
  "Detect the interview question from your microphone or practice mode.",
  "Pull context from your saved profile, resume, experience, and skills.",
  "Generate an answer you can copy, shorten, expand, or make more professional.",
];

function PlatformChip({
  name,
  accentClassName,
  className,
}: {
  name: string;
  accentClassName: string;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex items-center gap-2 rounded-full border border-white/12 bg-slate-950/80 px-4 py-2 text-sm font-medium text-slate-100 shadow-[0_20px_60px_-30px_rgba(14,165,233,0.4)] backdrop-blur-xl",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={["h-2.5 w-2.5 rounded-full", accentClassName].join(" ")} />
      <span>{name}</span>
    </div>
  );
}

export function HirePilotWorksEverywhere() {
  return (
    <section id="works-everywhere" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#040b17] px-6 py-16 shadow-[0_45px_120px_-60px_rgba(14,165,233,0.55)] md:px-10 lg:px-14">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-sky-500/20 blur-[110px]" />
            <div className="absolute left-16 top-1/3 h-44 w-44 rounded-full bg-cyan-400/10 blur-[90px]" />
            <div className="absolute bottom-10 right-10 h-52 w-52 rounded-full bg-indigo-500/15 blur-[110px]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_40%),linear-gradient(180deg,rgba(10,20,35,0.35),rgba(4,11,23,0.95))]" />
          </div>

          <div className="relative mx-auto max-w-3xl text-center">
            <Badge className="border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-100">
              Universal Compatibility
            </Badge>
            <h2 className="font-heading mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
              Interview Confidently.
              <span className="block text-sky-400">On Any Platform.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-300">
              HirePilot seamlessly integrates with your favorite meeting tools.
              Our advanced AI detects questions in real time across Zoom, Teams,
              Meet, and more, providing instant, invisible support.
            </p>
            <div className="mt-10">
              <Button
                type="button"
                size="lg"
                className="h-12 rounded-full bg-sky-500 px-8 text-base font-semibold text-white shadow-lg shadow-sky-500/25 hover:bg-sky-400"
              >
                Watch Demo
                <PlayCircleIcon className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="relative mx-auto mt-16 max-w-6xl">
            {floatingPlatforms.map((platform) => (
              <div
                key={platform.name}
                className={[
                  "pointer-events-none absolute z-10 hidden lg:block",
                  platform.className,
                ].join(" ")}
              >
                <PlatformChip
                  name={platform.name}
                  accentClassName={platform.accentClassName}
                />
              </div>
            ))}

            <div className="rounded-[30px] border border-white/12 bg-white/[0.05] p-3 shadow-[0_25px_80px_-50px_rgba(59,130,246,0.65)] backdrop-blur-xl md:p-4">
              <div className="overflow-hidden rounded-[26px] border border-white/12 bg-[#071221]">
                <div className="border-b border-white/10 px-6 py-6 md:px-8">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-100">
                      HirePilot AI
                    </span>
                    <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
                      Interview Assistant
                    </span>
                  </div>

                  <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                      <h3 className="font-heading text-2xl font-semibold text-white md:text-[2rem]">
                        HirePilot AI Interview Assistant
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-slate-300 md:text-base">
                        HirePilot listens to interview questions in real time
                        and suggests strong, personalized answers based on your
                        resume, skills, and experience.
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2.5">
                        {topFeaturePills.map((pill) => (
                          <span
                            key={pill}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-100"
                          >
                            <SparklesIcon className="h-4 w-4 text-sky-300" />
                            {pill}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button
                        type="button"
                        className="h-11 rounded-full bg-sky-500 px-6 text-sm font-semibold text-white hover:bg-sky-400"
                      >
                        Start HirePilot
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-full border-white/15 bg-white/5 px-6 text-sm font-semibold text-slate-100 hover:bg-white/10 hover:text-white"
                      >
                        View Demo
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 p-6 md:p-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)]">
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_-35px_rgba(59,130,246,0.45)]">
                      <div className="flex items-center gap-2">
                        <BoltIcon className="h-5 w-5 text-sky-300" />
                        <h4 className="text-base font-semibold text-white">
                          Live Listening Options
                        </h4>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-slate-300">
                        Choose whether HirePilot should listen through your
                        microphone or from shared tab/app audio.
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-[#091627] p-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-300">
                              <MicrophoneIcon className="h-5 w-5" />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-white">
                                Listen with your microphone
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-4 h-10 w-full rounded-full border-white/10 bg-white/5 text-sm font-medium text-slate-100 hover:bg-white/10 hover:text-white"
                          >
                            Start Listening
                          </Button>
                        </div>

                        <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 p-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-200">
                              <ComputerDesktopIcon className="h-5 w-5" />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-white">
                                Listen to interview audio
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            className="mt-4 h-10 w-full rounded-full bg-sky-500 text-sm font-semibold text-white hover:bg-sky-400"
                          >
                            Share tab or app audio
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                      <div className="flex items-center gap-2">
                        <ChatBubbleLeftRightIcon className="h-5 w-5 text-sky-300" />
                        <h4 className="text-base font-semibold text-white">
                          Detected Question
                        </h4>
                      </div>
                      <p className="mt-4 rounded-2xl border border-white/8 bg-[#091627] px-4 py-4 text-sm leading-relaxed text-slate-100">
                        &ldquo;Can you tell me about a time you had to optimize
                        a complex system under a tight deadline?&rdquo;
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <SparklesIcon className="h-5 w-5 text-sky-300" />
                          <h4 className="text-base font-semibold text-white">
                            Suggested Answer
                          </h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
                            <ClipboardDocumentIcon className="h-4 w-4 text-sky-300" />
                            Copy
                          </span>
                          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
                            Shorten
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 space-y-4 rounded-2xl border border-white/8 bg-[#091627] px-4 py-4 text-sm leading-relaxed text-slate-200">
                        <p>
                          In my previous role at TechCorp, we faced a critical
                          performance bottleneck right before a major product
                          launch. The main database queries were taking over 5
                          seconds to resolve.
                        </p>
                        <p>
                          I took the initiative to analyze the query execution
                          plans and identified missing composite indexes. By
                          implementing those and caching frequent read-heavy
                          responses using Redis, I reduced the load time to
                          under 200ms within a 48-hour window, ensuring a smooth
                          launch.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                      <div className="flex items-center gap-2">
                        <LightBulbIcon className="h-5 w-5 text-amber-300" />
                        <h4 className="text-base font-semibold text-white">
                          Interview Tips
                        </h4>
                      </div>
                      <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/10 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
                          Tip
                        </p>
                        <p className="mt-2 text-sm font-medium text-white">
                          Structure answers using STAR method.
                        </p>
                      </div>
                      <p className="mt-4 text-sm leading-relaxed text-slate-300">
                        Keep answers grounded in specific work examples instead
                        of broad claims.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                      <div className="flex items-center gap-2">
                        <SparklesIcon className="h-5 w-5 text-sky-300" />
                        <h4 className="text-base font-semibold text-white">
                          HirePilot Workflow
                        </h4>
                      </div>
                      <div className="mt-4 space-y-3">
                        {workflowItems.map((item, index) => (
                          <div
                            key={item}
                            className="flex gap-3 rounded-2xl border border-white/8 bg-[#091627] px-4 py-3"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sm font-semibold text-sky-200">
                              {index + 1}
                            </span>
                            <p className="text-sm leading-relaxed text-slate-300">
                              {item}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-center gap-3 lg:hidden">
              {floatingPlatforms.map((platform) => (
                <PlatformChip
                  key={platform.name}
                  name={platform.name}
                  accentClassName={platform.accentClassName}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
