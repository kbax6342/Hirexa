// File: /Hirexa/my-app/components/navbar.tsx
"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { clearAppliedJobsSession } from "@/app/lib/appliedJobsSession";
import { Button } from "../components/ui/button";
import {
  Bars3Icon,
  ChevronDownIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

type NavChild = {
  label: string;
  description?: string;
  href: string;
  badge?: string;
  icon?: NavIcon;
};

type NavItem = {
  label: string;
  href?: string;
  dropdown?: boolean;
  children?: NavChild[];
};

type HirePilotNavStatus = {
  hirePilotUnlimited?: boolean;
  hirePilotCredits?: number;
  monthlyCredits?: number;
  purchasedCredits?: number;
};

const guestNav: NavItem[] = [
  { label: "Features", href: "/#features" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Find Jobs", href: "/jobs" },
  { label: "Job Locations", href: "/locations" },
];

const authedNav: NavItem[] = [
  { label: "Smart Matches", href: "/dashboard" },
  { label: "AI Application Assistant", href: "/job-tools/generate" },
  {
    label: "Agents",
    href: "#",
    dropdown: true,
    children: [
      {
        label: "Career Coach",
        description:
          "Practical AI guidance for your next role, positioning, and search strategy",
        href: "/job-tools/career-coach",
      },
      {
        label: "HirePilot",
        description: "Real-time interview answers powered by your Hirexa profile",
        href: "/hirepilot",
        badge: "NEW",
        icon: PaperAirplaneIcon,
      },
    ],
  },
];

const agencyNav: NavItem[] = [
  { label: "Add job order", href: "/agency/job-orders" },
  { label: "Upload resumes", href: "/agency/candidates" },
  { label: "View profile", href: "/agency/profile" },
  { label: "Run AI match", href: "/agency/job-orders" },
];

function DesktopNav({ items }: { items: NavItem[] }) {
  return (
    <div className="hidden items-center gap-7 lg:flex">
      {items.map((item) => {
        if (!item.dropdown) {
          return (
            <Link
              key={item.label}
              href={item.href || "#"}
              className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          );
        }

        return <NavDropdown key={item.label} item={item} />;
      })}
    </div>
  );
}

function NavDropdown({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => e.preventDefault()}
      >
        {item.label}
        <ChevronDownIcon className="h-4 w-4" />
      </button>

      <div className="absolute left-0 top-full h-3 w-44" />

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-2 w-[340px] overflow-hidden rounded-2xl border border-border/60 bg-background shadow-xl"
          role="menu"
        >
          <div className="p-2">
            {item.children?.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                className="block rounded-xl p-3 hover:bg-secondary/60"
                role="menuitem"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {child.icon ? (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-white">
                          <child.icon className="h-4 w-4" />
                        </span>
                      ) : null}
                      <div className="text-sm font-semibold text-foreground">
                        {child.label}
                      </div>
                      {child.badge ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-foreground">
                          {child.badge}
                        </span>
                      ) : null}
                    </div>
                    {child.description ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {child.description}
                      </div>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isAuthed = status === "authenticated";
  const isAgencyWorkspace =
    pathname?.startsWith("/agency") || pathname?.startsWith("/recruiter");
  const hideOnMobile =
    pathname === "/" ||
    pathname === "/onboarding/job-interest" ||
    pathname === "/onboarding/job-goal" ||
    pathname === "/onboarding/job-priorities" ||
    pathname === "/onboarding/resume-import" ||
    pathname === "/onboarding/work-story" ||
    pathname === "/onboarding/job-location" ||
    pathname === "/onboarding/highlight-skills" ||
    pathname === "/onboarding/job-filters" ||
    pathname === "/onboarding/hirexa-support" ||
    pathname === "/onboarding/hirexa-support-extras" ||
    pathname === "/onboarding/hiring-signal" ||
    pathname === "/onboarding/create-account" ||
    pathname === "/onboarding/verify-account";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hirePilotStatus, setHirePilotStatus] =
    useState<HirePilotNavStatus | null>(null);
  const [hirePilotLoading, setHirePilotLoading] = useState(false);
  const [mobileAgentsOpen, setMobileAgentsOpen] = useState(false);

  const signInHref = `/api/auth/signin?callbackUrl=${encodeURIComponent(
    pathname || "/"
  )}`;

  const navLinks = !isAuthed ? guestNav : isAgencyWorkspace ? agencyNav : authedNav;

  function handleSignOut() {
    clearAppliedJobsSession();
    void signOut({ callbackUrl: "/" });
  }

  useEffect(() => {
    if (!isAuthed || isAgencyWorkspace) {
      setHirePilotStatus(null);
      setHirePilotLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();

    async function loadHirePilotStatus() {
      try {
        setHirePilotLoading(true);
        const response = await fetch("/api/user/hirepilot-status", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 401 && active) {
            setHirePilotStatus(null);
          }
          return;
        }

        const data = (await response.json().catch(() => null)) as
          | HirePilotNavStatus
          | null;
        if (active) {
          setHirePilotStatus(data);
        }
      } catch {
        if (active) {
          setHirePilotStatus(null);
        }
      } finally {
        if (active) {
          setHirePilotLoading(false);
        }
      }
    }

    void loadHirePilotStatus();

    return () => {
      active = false;
      controller.abort();
    };
  }, [isAgencyWorkspace, isAuthed]);

  const hirePilotDesktopLabel = hirePilotLoading
    ? "HirePilot: --"
    : hirePilotStatus?.hirePilotUnlimited
      ? "HirePilot: Unlimited"
      : `HirePilot: ${Number(hirePilotStatus?.hirePilotCredits ?? 0)}`;
  const hirePilotTooltip = hirePilotStatus
    ? hirePilotStatus.hirePilotUnlimited
      ? "Legacy unlimited HirePilot access is active."
      : `Monthly credits: ${Number(
          hirePilotStatus.monthlyCredits ?? 0
        )} • Purchased credits: ${Number(hirePilotStatus.purchasedCredits ?? 0)}`
    : "HirePilot credit status";

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 border-b border-white/8 bg-[#151c29] ${
        hideOnMobile ? "hidden md:block" : ""
      }`}
    >
      <nav className="relative mx-6 flex min-h-[76px] w-[calc(100%-3rem)] items-center justify-between pl-5 pr-0 py-4 lg:mx-0 lg:ml-6 lg:w-full lg:pl-6 lg:pr-[4%]">
        <div aria-hidden="true" className="h-10 w-10 shrink-0 lg:hidden" />

        <Link
          href="/"
          className="absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 lg:static lg:z-auto lg:translate-x-0"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-sky-500/90 shadow-[0_12px_30px_-18px_rgba(14,165,233,0.85)]">
            <span className="text-sm font-bold text-white">H</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-white sm:text-xl">
            Hirexa <span className="text-sky-400">AI</span>
            {isAgencyWorkspace ? <span className="font-normal text-white"> Agency</span> : null}
          </span>
        </Link>

        <DesktopNav items={navLinks} />

        <div className="hidden items-center lg:flex">
          {status === "loading" ? (
            <div className="h-9 w-28 animate-pulse rounded-full bg-secondary" />
          ) : !isAuthed ? (
            <Button asChild className="rounded-full px-6 text-sm font-medium">
              <Link href={signInHref}>Sign In</Link>
            </Button>
          ) : (
            <>
              {!isAgencyWorkspace ? (
                <Link
                  href="/settings/subscription"
                  title={hirePilotTooltip}
                  className="inline-flex items-center rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100"
                >
                  {hirePilotDesktopLabel}
                </Link>
              ) : null}

              <div className="relative ml-4 group">
                <div className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
                  <UserCircleIcon className="h-5 w-5 text-muted-foreground" />
                  <span className="max-w-[180px] truncate">
                    {session.user?.name || session.user?.email}
                  </span>
                  <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="absolute right-0 top-full h-3 w-44" />

                <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-border/60 bg-background shadow-lg opacity-0 scale-95 pointer-events-none transition-all duration-200 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100">
                  <div className="py-1 text-sm">
                    <Link
                      href="/profile"
                      className="block px-4 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      Profile
                    </Link>
                    <Link
                      href="/saved-jobs"
                      className="block px-4 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      Saved Jobs
                    </Link>
                    <Link
                      href="/settings"
                      className="block px-4 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      Settings
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full px-4 py-2 text-left text-red-600 hover:bg-secondary"
                    >
                      Log out
                    </button>
                  </div>
                </div>
              </div>

              {!isAgencyWorkspace ? (
                <Link
                  href="/agency/dashboard"
                  title="Recruiter accounts only"
                  className="ml-6 inline-flex items-center rounded-full border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
                >
                  Agency Dashboard
                </Link>
              ) : null}
            </>
          )}
        </div>

        <button
          type="button"
          className="relative z-20 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white transition hover:bg-white/[0.08] lg:hidden"
          onClick={() => {
            setMobileOpen((value) => {
              const nextValue = !value;
              if (!nextValue) {
                setMobileAgentsOpen(false);
              }
              return nextValue;
            });
          }}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? (
            <XMarkIcon className="h-6 w-6" />
          ) : (
            <Bars3Icon className="h-6 w-6" />
          )}
        </button>
      </nav>

      {mobileOpen && (
        <div className="border-t border-white/8 bg-[#151c29] lg:hidden">
          <div className="flex flex-col gap-1 px-5 py-6">
            {navLinks.map((item) => {
              if (item.dropdown && item.children?.length) {
                const isAgents = item.label === "Agents";
                const expanded = isAgents ? mobileAgentsOpen : true;

                return (
                  <div key={item.label} className="flex flex-col">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-sm font-medium text-white hover:bg-white/[0.05]"
                      onClick={() => {
                        if (isAgents) {
                          setMobileAgentsOpen((value) => !value);
                        }
                      }}
                      aria-expanded={expanded}
                      aria-controls={isAgents ? "mobile-agents-panel" : undefined}
                    >
                      <span className="flex items-center gap-1">{item.label}</span>
                      <ChevronDownIcon
                        className={`h-4 w-4 transition-transform ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {expanded && (
                      <div
                        id={isAgents ? "mobile-agents-panel" : undefined}
                        className="ml-3 mt-1 flex flex-col gap-1 border-l border-white/8 pl-3"
                      >
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className="rounded-2xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/[0.05] hover:text-white"
                            onClick={() => {
                              setMobileOpen(false);
                              setMobileAgentsOpen(false);
                            }}
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-2">
                                {child.icon ? (
                                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-white">
                                    <child.icon className="h-4 w-4" />
                                  </span>
                                ) : null}
                                <span>{child.label}</span>
                              </span>
                              {child.badge ? (
                                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-foreground">
                                  {child.badge}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href || "#"}
                  className="flex items-center gap-1 rounded-2xl px-3 py-3 text-sm text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white"
                  onClick={() => {
                    setMobileOpen(false);
                    setMobileAgentsOpen(false);
                  }}
                >
                  {item.label}
                </Link>
              );
            })}

            <div className="mt-4 flex flex-col gap-3 border-t border-white/8 pt-4">
              {status === "loading" ? (
                <div className="h-10 w-full animate-pulse rounded-xl bg-secondary" />
              ) : !isAuthed ? (
                <>
                  <Button
                    asChild
                    variant="ghost"
                    className="justify-start rounded-2xl text-sm text-slate-300 hover:bg-white/[0.05] hover:text-white"
                  >
                    <Link
                      href={signInHref}
                      onClick={() => {
                        setMobileOpen(false);
                        setMobileAgentsOpen(false);
                      }}
                    >
                      Sign In
                    </Link>
                  </Button>

                  <Button
                    asChild
                    className="rounded-2xl bg-sky-500 text-sm font-medium text-white hover:bg-sky-400"
                  >
                    <Link
                      href={signInHref}
                      onClick={() => {
                        setMobileOpen(false);
                        setMobileAgentsOpen(false);
                      }}
                    >
                      Get Started
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  {!isAgencyWorkspace ? (
                    <Link
                      href="/settings/subscription"
                      className="inline-flex items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100"
                      onClick={() => {
                        setMobileOpen(false);
                        setMobileAgentsOpen(false);
                      }}
                    >
                      {hirePilotDesktopLabel}
                    </Link>
                  ) : null}

                  {!isAgencyWorkspace ? (
                    <Button
                      asChild
                      variant="ghost"
                      className="justify-start rounded-2xl text-sm text-slate-300 hover:bg-white/[0.05] hover:text-white"
                    >
                      <Link
                        href="/agency/dashboard"
                        title="Recruiter accounts only"
                        onClick={() => {
                          setMobileOpen(false);
                          setMobileAgentsOpen(false);
                        }}
                      >
                        Agency Dashboard
                      </Link>
                    </Button>
                  ) : null}

                  <Button
                    asChild
                    variant="ghost"
                    className="justify-start rounded-2xl text-sm text-slate-300 hover:bg-white/[0.05] hover:text-white"
                  >
                    <Link
                      href="/profile"
                      onClick={() => {
                        setMobileOpen(false);
                        setMobileAgentsOpen(false);
                      }}
                    >
                      Profile
                    </Link>
                  </Button>

                  <Button
                    asChild
                    variant="ghost"
                    className="justify-start rounded-2xl text-sm text-slate-300 hover:bg-white/[0.05] hover:text-white"
                  >
                    <Link
                      href="/saved-jobs"
                      onClick={() => {
                        setMobileOpen(false);
                        setMobileAgentsOpen(false);
                      }}
                    >
                      Saved Jobs
                    </Link>
                  </Button>

                  <Button
                    asChild
                    variant="ghost"
                    className="justify-start rounded-2xl text-sm text-slate-300 hover:bg-white/[0.05] hover:text-white"
                  >
                    <Link
                      href="/settings"
                      onClick={() => {
                        setMobileOpen(false);
                        setMobileAgentsOpen(false);
                      }}
                    >
                      Settings
                    </Link>
                  </Button>

                  <Button
                    variant="destructive"
                    className="rounded-2xl text-sm font-medium"
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileAgentsOpen(false);
                      handleSignOut();
                    }}
                  >
                    Log out
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
