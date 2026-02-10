"use client";

import { useMemo, useState } from "react";
import {
    ArrowUpTrayIcon,
    PencilSquareIcon,
    StarIcon,
    ShieldCheckIcon,
    BriefcaseIcon,
    CurrencyDollarIcon,
    AcademicCapIcon,
    BuildingOffice2Icon,
    ChevronDownIcon,
    ChevronUpIcon,
    TrashIcon,
  } from "@heroicons/react/24/outline";
  

type Stat = {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: "peach" | "yellow" | "blue";
};

type Chip = {
  label: string;
  icon: React.ReactNode;
};
type ExperienceItem = {
    id: string;
    title: string;
    company: string;
    location: string;
    dateRange: string;
    bullets: string[];
  };



  

  

export default function ProfilePage() {
  const [name, setName] = useState("Sid");
  const [email, setEmail] = useState("sid@hirexa.com");
  const [phone, setPhone] = useState("+1 (555) 123-4567");
  const [about, setAbout] = useState(
    "Tell us a bit about yourself — what roles you want, what you’re great at, and what you’re looking for next."
  );

  const [expandedExp, setExpandedExp] = useState<Record<string, boolean>>({});

  const [experience, setExperience] = useState<ExperienceItem[]>([
    {
      id: "exp-1",
      title: "Application Developer I | NetSuite Developer",
      company: "BioBridge Global",
      location: "TX, San Antonio",
      dateRange: "1/2024 – 9/2024",
      bullets: [
        "Developed and maintained frontend components using React.js and TypeScript.",
        "Implemented RESTful APIs and backend services using .NET and SQL Server.",
        "Built SQL queries and stored procedures to support data-driven applications.",
      ],
    },
    {
      id: "exp-2",
      title: "NetSuite Developer",
      company: "LogoFit",
      location: "MI, Flint",
      dateRange: "4/2023 – 9/2023",
      bullets: [
        "Served as the sole NetSuite Developer for a manufacturing company.",
        "Designed and deployed SuiteScripts (1.0/2.0) for User Events, Client Scripts, Scheduled Scripts, and RESTlets.",
        "Built integrations with 3rd-party systems using SuiteTalk and SuiteScript APIs.",
      ],
    },
    {
      id: "exp-3",
      title: "Web & Office Developer",
      company: "Ulliance Inc.",
      location: "MI, Novi",
      dateRange: "7/2021 – 9/2022",
      bullets: [
        "Designed and implemented modern websites and digital assets using HTML, CSS, jQuery, and Canva.",
        "Ensured compliance with HIPAA guidelines and company security policies.",
      ],
    },
    {
      id: "exp-4",
      title: "Web Developer",
      company: "Artisan Digital Media",
      location: "MI, Grand Rapids",
      dateRange: "11/2020 – 3/2021",
      bullets: [
        "Developed websites using Craft CMS, Twig, React.js, HTML, CSS, and JavaScript.",
        "Converted Photoshop designs into responsive web pages.",
        "Collaborated remotely with clients and teams via Slack.",
      ],
    },
    {
      id: "exp-5",
      title: "Software Quality Assurance Intern",
      company: "SpartanNash",
      location: "MI, Grand Rapids",
      dateRange: "5/2020 – 11/2020",
      bullets: [
        "Executed manual test cases in JIRA and logged defects.",
        "Conducted regression testing and provided usability feedback.",
        "Assisted in Kronos software rollout across distribution centers.",
      ],
    },
    {
      id: "exp-6",
      title: "Web Design Specialist",
      company: "CDK Global",
      location: "MI, Detroit",
      dateRange: "11/2017 – 3/2018",
      bullets: [
        "Delivered website updates for auto dealers, customizing forms and content.",
        "Conducted formal QA checks on team deliverables.",
      ],
    },
    {
      id: "exp-7",
      title: "Front-End / UI Developer",
      company: "GE Digital",
      location: "MI, Van Buren Township",
      dateRange: "2/2017 – 10/2017",
      bullets: [
        "Developed Ops Vision factory floor app with Polymer.js and Node.js.",
        "Delivered UI improvements that saved GE Transportation $300K per quarter.",
        "Gained UX certification through GE training program.",
      ],
    },
  ]);

  const chips: Chip[] = useMemo(
    () => [
      { label: "Career", icon: <BriefcaseIcon className="h-4 w-4" /> },
      { label: "Money", icon: <CurrencyDollarIcon className="h-4 w-4" /> },
      { label: "Skills", icon: <AcademicCapIcon className="h-4 w-4" /> },
      { label: "Company", icon: <BuildingOffice2Icon className="h-4 w-4" /> },
    ],
    []
  );

  const stats: Stat[] = useMemo(
    () => [
      {
        label: "Total experience",
        value: "7 Years",
        sub: "of total experience",
        icon: <ShieldCheckIcon className="h-5 w-5" />,
        accent: "peach",
      },
      {
        label: "Ratings",
        value: "4 Stars",
        sub: "from 3k customers",
        icon: <StarIcon className="h-5 w-5" />,
        accent: "yellow",
      },
      {
        label: "Profile strength",
        value: "High",
        sub: "ready for matching",
        icon: <ShieldCheckIcon className="h-5 w-5" />,
        accent: "blue",
      },
    ],
    []
  );

  function toggleExp(id: string) {
    setExpandedExp((p) => ({ ...p, [id]: !p[id] }));
  }

  function deleteExp(id: string) {
    setExperience((p) => p.filter((x) => x.id !== id));
  }

  function addExp() {
    setExperience((p) => [
      ...p,
      {
        id: `exp-${Date.now()}`,
        title: "New Title",
        company: "Company",
        location: "State, City",
        dateRange: "MM/YYYY – MM/YYYY",
        bullets: ["Add bullet points here..."],
      },
    ]);
  }
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto w-full max-w-6xl px-4 py-12">
        <div className="-mt-6 grid gap-6 lg:grid-cols-12">
          {/* Left card */}
          <section className="lg:col-span-5">
            <Card className="p-6">
              {/* avatar row */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="h-16 w-16 overflow-hidden rounded-full bg-gradient-to-br from-rose-200 to-amber-200 ring-4 ring-white">
                    {/* simple “avatar” blob */}
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-indigo-950">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                  </div>
                </div>

                <div className="flex-1" />

                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-200"
                >
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  Upload Photo
                </button>
              </div>

              {/* Fields */}
              <div className="mt-6 space-y-4">
                <FieldRow
                  label="Your Name"
                  value={name}
                  onEdit={() => {
                    const v = prompt("Name:", name);
                    if (v !== null) setName(v);
                  }}
                />
                <FieldRow
                  label="Email"
                  value={email}
                  onEdit={() => {
                    const v = prompt("Email:", email);
                    if (v !== null) setEmail(v);
                  }}
                />
                <FieldRow
                  label="Phone Number"
                  value={phone}
                  onEdit={() => {
                    const v = prompt("Phone:", phone);
                    if (v !== null) setPhone(v);
                  }}
                />
              </div>

              {/* Primary action */}
              <div className="mt-6">
                <button
                  type="button"
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  Save changes
                </button>
              </div>
            </Card>
          </section>

          {/* Right column */}
          <section className="lg:col-span-7">
            <div className="space-y-6">

              {/* Professional Details */}
              <Card className="p-6">
                <div className="flex-col items-start justify-between gap-4">
                    <div className="flex">
                    <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Professional Details
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      This information helps us match you to jobs faster and more
                      accurately.
                    </p>
                  </div>
                    </div>
                 

               


                  <div className="rounded-2xl bg-indigo-50 p-3 ring-1 ring-indigo-100">
                    <ShieldCheckIcon className="h-6 w-6 text-indigo-700" />
                  </div>

                   {/* Experience (under Expertise) */}
                    <div className="mt-6">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-slate-700">
                        Experience
                        </div>

                        <button
                        type="button"
                        onClick={addExp}
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200"
                        >
                        + Add experience
                        </button>
                    </div>

                    <div className="mt-3 space-y-3">
                        {experience.map((exp) => {
                        const open = !!expandedExp[exp.id];
                        const bullets = open ? exp.bullets : exp.bullets.slice(0, 2);
                        const showToggle = exp.bullets.length > 2;

                        return (
                            <div
                            key={exp.id}
                            className="rounded-2xl border border-slate-200 bg-white p-4"
                            >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <div className="text-sm font-semibold text-slate-900">
                                    {exp.title}
                                    </div>
                                    <span className="text-sm text-slate-300">|</span>
                                    <div className="text-sm font-semibold text-slate-700">
                                    {exp.company}
                                    </div>
                                </div>

                                <div className="mt-1 text-xs text-slate-500">
                                    {exp.location} • {exp.dateRange}
                                </div>
                                </div>

                                <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    aria-label="Edit experience"
                                    className="rounded-xl p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                                    onClick={() => alert("Edit (mock). Wire to modal later.")}
                                >
                                    <PencilSquareIcon className="h-5 w-5" />
                                </button>

                                <button
                                    type="button"
                                    aria-label="Delete experience"
                                    className="rounded-xl p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                                    onClick={() => deleteExp(exp.id)}
                                >
                                    <TrashIcon className="h-5 w-5" />
                                </button>
                                </div>
                            </div>

                            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                                {bullets.map((b, i) => (
                                <li key={i}>{b}</li>
                                ))}
                            </ul>

                            {showToggle ? (
                                <button
                                type="button"
                                onClick={() => toggleExp(exp.id)}
                                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                                >
                                {open ? "Show less" : "Show more"}
                                {open ? (
                                    <ChevronUpIcon className="h-4 w-4" />
                                ) : (
                                    <ChevronDownIcon className="h-4 w-4" />
                                )}
                                </button>
                            ) : null}
                            </div>
                        );
                        })}
                    </div>
                    </div>
                    
                </div>

                <div className="mt-5">
                  <div className="text-xs font-semibold text-slate-700">
                    Expertise in
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {chips.map((c) => (
                      <span
                        key={c.label}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.03)]"
                      >
                        <span className="text-slate-500">{c.icon}</span>
                        {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Stats blocks */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stats.map((s) => (
                  <StatCard key={s.label} stat={s} />
                ))}
              </div>

              {/* Optional “extra card” to match the right column depth */}
              <Card className="p-6">
                <div className="text-sm font-semibold text-slate-900">
                  Job-matching signals
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Add more details (roles, locations, salary, availability) to
                  boost match quality.
                </p>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Update Preferences
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Review Key Questions
                  </button>
                </div>
              </Card>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/* ----------------------------- UI Components ----------------------------- */

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-3xl border border-slate-200 bg-white shadow-sm",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function FieldRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-600">{label}</div>
          <div className="mt-1 truncate text-sm font-semibold text-slate-900">
            {value}
          </div>
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function StatCard({ stat }: { stat: { label: string; value: string; sub?: string; icon: React.ReactNode; accent: "peach" | "yellow" | "blue" } }) {
  const accent = stat.accent;

  const accentClasses =
    accent === "peach"
      ? "bg-orange-50 ring-orange-100 text-orange-700"
      : accent === "yellow"
      ? "bg-amber-50 ring-amber-100 text-amber-700"
      : "bg-sky-50 ring-sky-100 text-sky-700";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-600">{stat.label}</div>
          <div className="mt-2 text-lg font-extrabold text-slate-900">
            {stat.value}
          </div>
          {stat.sub ? (
            <div className="mt-1 text-xs text-slate-500">{stat.sub}</div>
          ) : null}
        </div>

        <div className={["rounded-2xl p-3 ring-1", accentClasses].join(" ")}>
          {stat.icon}
        </div>
      </div>
    </div>
  );
}
