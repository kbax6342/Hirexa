import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  MapPin,
  MessageSquareText,
  Sparkles,
  UsersRound,
} from "lucide-react";

const featureCards = [
  {
    title: "AI-Matched Hiring Events",
    text: "Stop scrolling through random event listings. Hirexa shows you the events most likely to connect you with employers hiring for your background.",
    icon: Sparkles,
  },
  {
    title: "Company Preview Before You Go",
    text: "Know who will be there before you arrive. Review employers, open roles, culture signals, and suggested talking points.",
    icon: UsersRound,
  },
  {
    title: "AI Event Prep Kit",
    text: "Walk in prepared. Hirexa builds a personalized prep kit with your elevator pitch, resume suggestions, recruiter questions, and event checklist.",
    icon: ClipboardCheck,
  },
  {
    title: "Follow-Up Assistant",
    text: "Save recruiter notes, track companies, and generate polished follow-up messages after the event.",
    icon: MessageSquareText,
  },
];

type FeaturedEvent = {
  name: string;
  match: string;
  focus: string;
  date?: string;
  time?: string;
  location: string;
};

// Placeholder event previews until real hiring event data is connected.
const featuredEvents: FeaturedEvent[] = [
  {
    name: "Detroit Tech Hiring Mixer",
    match: "91%",
    focus: "Software Engineering, AI, Product",
    location: "Detroit, MI",
  },
  {
    name: "Healthcare IT Career Fair",
    match: "84%",
    focus: "Data Analyst, Systems Analyst, Support",
    location: "Hybrid",
  },
  {
    name: "Entry-Level Career Expo",
    match: "78%",
    focus: "Internships, Apprenticeships, Junior Roles",
    location: "Online",
  },
];

export function HiringEventsSection() {
  return (
    <section id="hiring-events" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              Job Fairs + Hiring Events
            </p>
            <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl">
              Hiring Events That Match Your Career Goals
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Find job fairs, career expos, employer meetups, and local hiring
              events matched to your resume, skills, location, and target roles
              — then let Hirexa AI help you prepare before you walk in.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/jobs"
                className="inline-flex h-12 items-center justify-center rounded-full bg-sky-500 px-6 text-sm font-semibold text-white shadow-[0_18px_45px_-22px_rgba(14,165,233,0.75)] transition hover:bg-sky-400"
              >
                Find Hiring Events
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/job-tools/career-coach"
                className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card px-6 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:bg-secondary/60"
              >
                Build My Event Prep Kit
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-border bg-card p-5 shadow-[0_30px_90px_-60px_rgba(14,165,233,0.5)] md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Featured hiring events
                </p>
                <h3 className="mt-2 font-heading text-xl font-semibold text-foreground">
                  Matched event previews
                </h3>
              </div>
              <div className="hidden h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
                <CalendarDays className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {featuredEvents.map((event) => (
                <article
                  key={event.name}
                  className="rounded-2xl border border-border bg-background p-5 transition hover:border-primary/30 hover:bg-secondary/40"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h4 className="font-heading text-base font-semibold text-foreground">
                        {event.name}
                      </h4>
                      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                        {event.date ? (
                          <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-primary" />
                            {event.date}
                          </div>
                        ) : null}
                        {event.time ? (
                          <div className="flex items-center gap-2">
                            <Clock3 className="h-4 w-4 text-primary" />
                            {event.time}
                          </div>
                        ) : null}
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary" />
                          {event.location}
                        </div>
                      </div>
                    </div>
                    <div className="w-fit rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-700">
                      {event.match} match
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">Focus:</span>{" "}
                    {event.focus}
                  </p>
                  <Link
                    href="/job-tools/career-coach"
                    className="mt-4 inline-flex items-center text-sm font-semibold text-primary hover:underline"
                  >
                    View Event
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featureCards.map((feature) => {
            const Icon = feature.icon;

            return (
              <article
                key={feature.title}
                className="rounded-2xl border border-border bg-card p-6 transition hover:border-primary/30 hover:bg-secondary/50"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading mt-5 text-lg font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {feature.text}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
