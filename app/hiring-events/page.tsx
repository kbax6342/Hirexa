"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Clock3,
  Mail,
  MapPin,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

import { Footer } from "@/app/components/footer";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/lib/utils";

type EventType =
  | "Job Fair"
  | "Employer Hiring Day"
  | "Workshop"
  | "Training"
  | "Community Event";

type EventFormat = "Free" | "In-Person" | "Virtual" | "Hybrid";

type FilterId =
  | "all"
  | "job-fairs"
  | "workshops"
  | "training"
  | "virtual"
  | "this-week";

type HiringEvent = {
  id: string;
  title: string;
  type: EventType;
  date: string;
  time: string;
  location: string;
  description: string;
  partner: string;
  format: Extract<EventFormat, "In-Person" | "Virtual" | "Hybrid">;
  cost?: Extract<EventFormat, "Free">;
  isThisWeek: boolean;
  details: string[];
  audience: string;
};

const filterOptions = [
  { id: "all", label: "All Events" },
  { id: "job-fairs", label: "Job Fairs" },
  { id: "workshops", label: "Workshops" },
  { id: "training", label: "Training" },
  { id: "virtual", label: "Virtual" },
  { id: "this-week", label: "This Week" },
] as const satisfies ReadonlyArray<{ id: FilterId; label: string }>;

const detroitEvents: HiringEvent[] = [
  {
    id: "detroit-manufacturing-hiring-fair",
    title: "Detroit Manufacturing Hiring Fair",
    type: "Job Fair",
    date: "Friday, May 29, 2026",
    time: "10:00 AM - 2:00 PM",
    location: "Northwest Activities Center, Detroit, MI",
    description:
      "Meet Detroit-area manufacturers hiring for production, maintenance, logistics, and supervisor roles with same-day recruiter conversations.",
    partner: "Detroit at Work + Detroit Manufacturing Systems",
    format: "In-Person",
    cost: "Free",
    isThisWeek: true,
    audience:
      "Ideal for candidates looking for immediate openings in production, warehouse, and industrial operations.",
    details: [
      "Bring copies of your resume and a photo ID for faster employer check-in.",
      "Recruiters will be interviewing for entry-level through lead positions.",
      "Work-ready resources and job seeker support will be available on site.",
    ],
  },
  {
    id: "healthcare-careers-open-house",
    title: "Healthcare Careers Open House",
    type: "Employer Hiring Day",
    date: "Saturday, May 30, 2026",
    time: "9:30 AM - 1:00 PM",
    location: "Midtown Clinical Education Center, Detroit, MI",
    description:
      "Explore healthcare roles across patient services, administrative support, and allied health pathways with local employers and training partners.",
    partner: "Henry Ford Health Workforce Team",
    format: "In-Person",
    cost: "Free",
    isThisWeek: true,
    audience:
      "Best for job seekers exploring clinical support, front-desk, scheduling, and patient care career tracks.",
    details: [
      "Speak directly with hiring teams about current openings and upcoming cohorts.",
      "Get guidance on certifications, entry requirements, and transferable skills.",
      "Community workforce partners will share job readiness and placement support.",
    ],
  },
  {
    id: "resume-interview-prep-workshop",
    title: "Resume & Interview Prep Workshop",
    type: "Workshop",
    date: "Thursday, May 28, 2026",
    time: "6:00 PM - 7:30 PM",
    location: "Virtual via Zoom",
    description:
      "A practical session covering resume updates, recruiter-friendly storytelling, and stronger interview answers tailored to Detroit employers.",
    partner: "Detroit Public Library + Michigan Works!",
    format: "Virtual",
    cost: "Free",
    isThisWeek: true,
    audience:
      "A strong fit for candidates who want to tighten their materials before a fair, hiring day, or networking event.",
    details: [
      "Walk through resume updates that improve clarity without sounding generic.",
      "Practice short-answer interview framing you can use immediately.",
      "Leave with an event-ready checklist for follow-up and next steps.",
    ],
  },
  {
    id: "downtown-detroit-tech-hiring-mixer",
    title: "Downtown Detroit Tech Hiring Mixer",
    type: "Community Event",
    date: "Wednesday, June 3, 2026",
    time: "5:30 PM - 8:00 PM",
    location: "TechTown Detroit, Midtown + virtual livestream",
    description:
      "Connect with hiring teams, founders, and workforce programs supporting Detroit tech, product, data, and customer success talent.",
    partner: "TechTown Detroit",
    format: "Hybrid",
    cost: "Free",
    isThisWeek: false,
    audience:
      "Great for early-career and mid-career candidates interested in Detroit's growing tech and startup ecosystem.",
    details: [
      "Meet employers in a lower-pressure networking format before applying.",
      "Hear short talks on local hiring needs, skill gaps, and training resources.",
      "Virtual attendees can join selected panels and recruiter Q&A sessions.",
    ],
  },
  {
    id: "skilled-trades-training-info-session",
    title: "Skilled Trades Training Info Session",
    type: "Training",
    date: "Saturday, June 6, 2026",
    time: "11:00 AM - 12:30 PM",
    location: "Detroit Training Center, Corktown",
    description:
      "Learn about short-term training paths, apprenticeship preparation, and employer-connected trades programs for Detroit residents.",
    partner: "Detroit Training Center",
    format: "In-Person",
    cost: "Free",
    isThisWeek: false,
    audience:
      "Designed for candidates exploring construction, CDL, heavy equipment, and union-connected training pathways.",
    details: [
      "Review available programs, timelines, and scholarship or funding options.",
      "Talk with staff about training schedules that fit working adults.",
      "Get connected to next-step enrollment and workforce support resources.",
    ],
  },
];

const heroHighlights = [
  "Job fairs, employer hiring days, and community meetups around Detroit",
  "Workshops and training sessions that help candidates get event-ready",
  "Public, mobile-friendly browsing with lightweight filters for a fast first version",
];

const partnerHighlights = [
  "Employers can promote hiring days, open houses, and targeted recruiting events.",
  "Nonprofits and workforce organizations can spotlight workshops and community job opportunities.",
  "Training providers can share info sessions, enrollment windows, and employer-connected programs.",
];

function getTypeBadgeClass(type: EventType) {
  switch (type) {
    case "Job Fair":
      return "border-sky-300/20 bg-sky-500/12 text-sky-100";
    case "Employer Hiring Day":
      return "border-emerald-300/20 bg-emerald-500/12 text-emerald-100";
    case "Workshop":
      return "border-violet-300/20 bg-violet-500/12 text-violet-100";
    case "Training":
      return "border-amber-300/20 bg-amber-500/12 text-amber-100";
    case "Community Event":
      return "border-cyan-300/20 bg-cyan-500/12 text-cyan-100";
    default:
      return "border-white/10 bg-white/5 text-white";
  }
}

function getFormatBadgeClass(format: Extract<EventFormat, "In-Person" | "Virtual" | "Hybrid">) {
  switch (format) {
    case "In-Person":
      return "border-white/10 bg-white/[0.06] text-slate-100";
    case "Virtual":
      return "border-sky-300/20 bg-sky-500/10 text-sky-100";
    case "Hybrid":
      return "border-cyan-300/20 bg-cyan-500/10 text-cyan-100";
    default:
      return "border-white/10 bg-white/5 text-white";
  }
}

export default function HiringEventsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredEvents = detroitEvents.filter((event) => {
    const matchesFilter =
      activeFilter === "all"
        ? true
        : activeFilter === "job-fairs"
          ? event.type === "Job Fair"
          : activeFilter === "workshops"
            ? event.type === "Workshop"
            : activeFilter === "training"
              ? event.type === "Training"
              : activeFilter === "virtual"
                ? event.format === "Virtual" || event.format === "Hybrid"
                : event.isThisWeek;

    const matchesQuery =
      normalizedQuery.length === 0
        ? true
        : [
            event.title,
            event.type,
            event.location,
            event.description,
            event.partner,
            event.audience,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);

    return matchesFilter && matchesQuery;
  });

  return (
    <div className="min-h-screen bg-[#050816] pt-24 text-white">
      <main className="relative mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.26),transparent_52%),radial-gradient(circle_at_18%_22%,rgba(32,200,255,0.16),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(59,130,246,0.18),transparent_30%)]" />

        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(7,12,28,0.96),rgba(6,18,40,0.92))] shadow-[0_32px_110px_-56px_rgba(14,165,233,0.6)]">
          <div className="grid gap-8 px-6 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-12">
            <div>
              <Badge className="border-sky-300/20 bg-sky-500/12 text-sky-100 hover:bg-sky-500/12">
                Detroit Talent Network
              </Badge>
              <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Detroit Hiring Events
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                Find job fairs, employer hiring days, training events, workshops, and
                workforce opportunities happening across Detroit and nearby community
                partner networks.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-sky-500 px-6 text-sm font-semibold text-white shadow-[0_18px_45px_-22px_rgba(14,165,233,0.75)] hover:bg-sky-400"
                >
                  <Link href="#search-and-filter">
                    Find an Event
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-full border-white/12 bg-white/[0.04] px-6 text-sm font-semibold text-white hover:bg-white/[0.08] hover:text-white"
                >
                  <Link href="/newsletter#newsletter-signup">Get Job Alerts</Link>
                </Button>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm">
                  <div className="text-2xl font-semibold text-white">{detroitEvents.length}</div>
                  <div className="mt-1 text-sm text-slate-300">Sample Detroit events ready for launch</div>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm">
                  <div className="text-2xl font-semibold text-white">Free</div>
                  <div className="mt-1 text-sm text-slate-300">Community-focused opportunities and workshops</div>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm">
                  <div className="text-2xl font-semibold text-white">Mixed format</div>
                  <div className="mt-1 text-sm text-slate-300">In-person, virtual, and hybrid access</div>
                </div>
              </div>
            </div>

            <Card className="rounded-[1.75rem] border-white/10 bg-white/[0.05] text-white shadow-[0_24px_70px_-42px_rgba(14,165,233,0.55)] backdrop-blur-sm">
              <CardContent className="p-6 sm:p-7">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/80">
                      What Job Seekers Can Find
                    </p>
                    <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-white">
                      Detroit events built for real next steps
                    </h2>
                  </div>
                  <div className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-100 sm:flex">
                    <Sparkles className="h-6 w-6" />
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {heroHighlights.map((highlight) => (
                    <div
                      key={highlight}
                      className="rounded-[1.25rem] border border-white/10 bg-slate-950/55 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-100">
                          <BriefcaseBusiness className="h-4 w-4" />
                        </div>
                        <p className="text-sm leading-6 text-slate-200">{highlight}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-[1.5rem] border border-sky-300/15 bg-sky-500/10 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-100/80">
                    Quick View
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge className="border-sky-300/20 bg-sky-500/12 text-sky-100">
                      Hiring fairs
                    </Badge>
                    <Badge className="border-violet-300/20 bg-violet-500/12 text-violet-100">
                      Workshops
                    </Badge>
                    <Badge className="border-amber-300/20 bg-amber-500/12 text-amber-100">
                      Training
                    </Badge>
                    <Badge className="border-cyan-300/20 bg-cyan-500/12 text-cyan-100">
                      Community meetups
                    </Badge>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-200">
                    This first version uses sample Detroit event data and frontend-only filters so
                    it is easy to expand into live partner submissions later.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="search-and-filter" className="mt-8">
          <Card className="rounded-[1.75rem] border-white/10 bg-white/[0.04] text-white backdrop-blur-sm">
            <CardContent className="p-6 sm:p-7">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200/80">
                    Search + Filter
                  </p>
                  <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-white">
                    Browse Detroit hiring events by type, format, or timing
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Use the search bar and quick filters below to narrow the event list. Filtering
                    is powered by local state for now, which keeps the first release lightweight and
                    simple to extend later.
                  </p>
                </div>

                <div className="w-full max-w-xl">
                  <label htmlFor="event-search" className="text-sm font-medium text-slate-200">
                    Search events
                  </label>
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="event-search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search Detroit events, employers, or neighborhoods"
                      className="h-12 rounded-full border-white/10 bg-white/[0.05] pl-11 text-white placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {filterOptions.map((filter) => {
                  const isActive = filter.id === activeFilter;

                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setActiveFilter(filter.id)}
                      aria-pressed={isActive}
                      className={cn(
                        "inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold transition",
                        isActive
                          ? "border-sky-300/20 bg-sky-500 text-white shadow-[0_14px_36px_-24px_rgba(14,165,233,0.8)]"
                          : "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
                      )}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-col gap-3 rounded-[1.25rem] border border-white/10 bg-slate-950/55 px-4 py-4 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-sky-300" />
                  <span>
                    Showing {filteredEvents.length} of {detroitEvents.length} sample Detroit events
                  </span>
                </div>
                <div className="text-slate-400">
                  Includes in-person, virtual, and hybrid opportunities from local partners
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="events" className="mt-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200/80">
                Upcoming Opportunities
              </p>
              <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-white">
                Detroit events for job seekers, career changers, and workforce learners
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Every card includes the event title, type, date, time, location, partner, and a
                quick description so candidates can scan opportunities fast on mobile or desktop.
              </p>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200">
              <Users className="h-4 w-4 text-sky-300" />
              Detroit, MI hiring events
            </div>
          </div>

          {filteredEvents.length > 0 ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {filteredEvents.map((event) => {
                const isExpanded = expandedEventId === event.id;

                return (
                  <Card
                    key={event.id}
                    className="rounded-[1.75rem] border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.92),rgba(2,6,23,0.86))] text-white shadow-[0_24px_70px_-46px_rgba(14,165,233,0.45)]"
                  >
                    <CardContent className="flex h-full flex-col p-6">
                      <div className="flex flex-wrap gap-2">
                        <Badge className={cn("border", getTypeBadgeClass(event.type))}>
                          {event.type}
                        </Badge>
                        {event.cost ? (
                          <Badge className="border-emerald-300/20 bg-emerald-500/10 text-emerald-100">
                            {event.cost}
                          </Badge>
                        ) : null}
                        <Badge className={cn("border", getFormatBadgeClass(event.format))}>
                          {event.format}
                        </Badge>
                        {event.isThisWeek ? (
                          <Badge className="border-amber-300/20 bg-amber-500/10 text-amber-100">
                            This Week
                          </Badge>
                        ) : null}
                      </div>

                      <h3 className="mt-4 font-heading text-2xl font-semibold tracking-tight text-white">
                        {event.title}
                      </h3>

                      <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                        <div className="flex items-start gap-2">
                          <CalendarDays className="mt-0.5 h-4 w-4 text-sky-300" />
                          <span>{event.date}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <Clock3 className="mt-0.5 h-4 w-4 text-sky-300" />
                          <span>{event.time}</span>
                        </div>
                        <div className="flex items-start gap-2 sm:col-span-2">
                          <MapPin className="mt-0.5 h-4 w-4 text-sky-300" />
                          <span>{event.location}</span>
                        </div>
                      </div>

                      <p className="mt-5 text-sm leading-7 text-slate-300">{event.description}</p>

                      <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/80">
                          Partner / Employer
                        </p>
                        <div className="mt-2 flex items-start gap-2 text-sm text-slate-100">
                          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                          <span>{event.partner}</span>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="mt-5 rounded-[1.25rem] border border-sky-300/15 bg-sky-500/10 p-4">
                          <p className="text-sm font-semibold text-white">What to expect</p>
                          <p className="mt-2 text-sm leading-6 text-slate-200">{event.audience}</p>
                          <ul className="mt-3 space-y-2 text-sm text-slate-300">
                            {event.details.map((detail) => (
                              <li key={detail} className="flex items-start gap-2">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />
                                <span>{detail}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="mt-6">
                        <Button
                          type="button"
                          onClick={() =>
                            setExpandedEventId((currentId) =>
                              currentId === event.id ? null : event.id
                            )
                          }
                          className="w-full rounded-full bg-sky-500 text-sm font-semibold text-white hover:bg-sky-400 sm:w-auto"
                        >
                          {isExpanded ? "Hide Details" : "View Details"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="mt-6 rounded-[1.75rem] border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-8 text-center">
                <h3 className="font-heading text-2xl font-semibold text-white">
                  No events match those filters yet
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Try a different search term or switch back to All Events to see the full Detroit
                  sample event list.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setActiveFilter("all");
                  }}
                  className="mt-6 rounded-full border-white/12 bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white"
                >
                  Reset filters
                </Button>
              </CardContent>
            </Card>
          )}
        </section>

        <section className="mt-12 overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(8,20,43,0.95),rgba(3,7,18,0.92))] px-6 py-8 shadow-[0_28px_80px_-48px_rgba(14,165,233,0.45)] sm:px-8 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200/80">
                For Employers & Workforce Partners
              </p>
              <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-white">
                Hosting a hiring event in Detroit?
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
                Employers, nonprofits, training providers, and workforce partners can list job
                fairs, workshops, employer meetups, and training events on Hirexa AI so Detroit job
                seekers can discover them in one place.
              </p>
              <Button
                asChild
                size="lg"
                className="mt-6 rounded-full bg-sky-500 px-6 text-sm font-semibold text-white hover:bg-sky-400"
              >
                <Link href="/contact-us">
                  Submit an Event
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="grid gap-4">
              {partnerHighlights.map((highlight) => (
                <div
                  key={highlight}
                  className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-100">
                      <Users className="h-5 w-5" />
                    </div>
                    <p className="text-sm leading-6 text-slate-200">{highlight}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-4 lg:grid-cols-2">
          <Card className="rounded-[1.75rem] border-white/10 bg-white/[0.04] text-white backdrop-blur-sm">
            <CardContent className="p-6 sm:p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-100">
                <Mail className="h-6 w-6" />
              </div>
              <h2 className="mt-5 font-heading text-2xl font-semibold tracking-tight text-white">
                Get Detroit hiring updates in your inbox
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Join the Hirexa AI newsletter for job alerts, product updates, and practical tips
                that help you prepare for new opportunities faster.
              </p>
              <Button
                asChild
                className="mt-6 rounded-full bg-sky-500 px-6 text-sm font-semibold text-white hover:bg-sky-400"
              >
                <Link href="/newsletter#newsletter-signup">
                  Get Job Alerts
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-white/10 bg-white/[0.04] text-white backdrop-blur-sm">
            <CardContent className="p-6 sm:p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.08] text-slate-100">
                <Users className="h-6 w-6" />
              </div>
              <h2 className="mt-5 font-heading text-2xl font-semibold tracking-tight text-white">
                Need help or want to partner with Hirexa AI?
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Reach out for event submissions, partnership questions, or help connecting Detroit
                job seekers to your workforce programs.
              </p>
              <Button
                asChild
                variant="outline"
                className="mt-6 rounded-full border-white/12 bg-white/[0.04] px-6 text-sm font-semibold text-white hover:bg-white/[0.08] hover:text-white"
              >
                <Link href="/contact-us">Contact Hirexa AI</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <Footer />
    </div>
  );
}
