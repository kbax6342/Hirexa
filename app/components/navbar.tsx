// File: /Hirexa/my-app/components/navbar.tsx
"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "../components/ui/button";
import {
  Bars3Icon,
  XMarkIcon,
  ChevronDownIcon,
  UserCircleIcon,
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
  // { label: "Job Resources", href: "/resources", dropdown: true },
];

const authedNav: NavItem[] = [
  { label: "Smart Matches", href: "/dashboard" },
  { label: "AI Application Assistant", href: "/job-tools/generate" },
  //{ label: "Applications", href: "/applications" },
  { label: "Profile", href: "/profile" },

  // ✅ Dropdown-only parent (no /agents navigation to avoid 404)
  {
    label: "Agents",
    href: "#",
    dropdown: true,
    children: [
      // {
      //   label: "Job Auto Apply Agent",
      //   description: "Applies to jobs for you",
      //   href: "/agents/auto-apply",
      // },
      {
        label: "Career Coach",
        description: "Practical AI guidance for your next role, positioning, and search strategy",
        href: "/agents/career-coach",
      },
      {
        label: "Outreach Copilot",
        description: "AI-assisted recruiter outreach for your best-fit job matches",
        href: "/job-tools/agents/linkedin-outreach",
      },
      // {
      //   label: "Resume Optimizer Agent",
      //   description: "Improves resumes",
      //   href: "/agents/resume-optimizer",
      // },
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
      {/* Parent: NOT a Link (prevents navigating to /agents 404) */}
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

      {/* Hover buffer (prevents flicker) */}
      <div className="absolute left-0 top-full h-3 w-44" />

      {/* Dropdown */}
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hirePilotStatus, setHirePilotStatus] = useState<HirePilotNavStatus | null>(null);
  const [hirePilotLoading, setHirePilotLoading] = useState(false);

  // ✅ NEW: control collapse/expand for mobile "Agents"
  const [mobileAgentsOpen, setMobileAgentsOpen] = useState(false);

  const signInHref = `/api/auth/signin?callbackUrl=${encodeURIComponent(
    pathname || "/"
  )}`;

  const navLinks = isAuthed ? authedNav : guestNav;

  useEffect(() => {
    if (!isAuthed) {
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

        const data = (await response.json().catch(() => null)) as HirePilotNavStatus | null;
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
  }, [isAuthed]);

  const hirePilotDesktopLabel = hirePilotLoading
    ? "HirePilot: --"
    : hirePilotStatus?.hirePilotUnlimited
      ? "HirePilot: Unlimited"
      : `HirePilot: ${Number(hirePilotStatus?.hirePilotCredits ?? 0)}`;
  const hirePilotTooltip = hirePilotStatus
    ? hirePilotStatus.hirePilotUnlimited
      ? "Legacy unlimited HirePilot access is active."
      : `Monthly credits: ${Number(hirePilotStatus.monthlyCredits ?? 0)} • Purchased credits: ${Number(
          hirePilotStatus.purchasedCredits ?? 0
        )}`
    : "HirePilot credit status";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* LEFT: BRAND (no image) */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">H</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">
            Hirexa <span className="text-accent">AI</span>
          </span>
        </Link>

        {/* CENTER: NAV LINKS (desktop) */}
        <DesktopNav items={navLinks} />

        {/* RIGHT: AUTH / ACCOUNT (desktop) */}
        <div className="hidden items-center gap-3 lg:flex">
          {status === "loading" ? (
            <div className="h-9 w-28 animate-pulse rounded-full bg-secondary" />
          ) : !isAuthed ? (
            <Button asChild className="rounded-full px-6 text-sm font-medium">
              <Link href={signInHref}>Sign In</Link>
            </Button>
          ) : (
            <>
              <Link
                href="/settings/subscription"
                title={hirePilotTooltip}
                className="inline-flex items-center rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100"
              >
                {hirePilotDesktopLabel}
              </Link>

              <div className="relative group">
                {/* Trigger */}
                <div className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
                  <UserCircleIcon className="h-5 w-5 text-muted-foreground" />
                  <span className="max-w-[180px] truncate">
                    {session.user?.name || session.user?.email}
                  </span>
                  <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Hover buffer (prevents flicker) */}
                <div className="absolute right-0 top-full h-3 w-44" />

                {/* Dropdown */}
                <div
                  className="
                    absolute right-0 top-full mt-2 w-44 rounded-xl border border-border/60 bg-background shadow-lg
                    opacity-0 scale-95 pointer-events-none
                    group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto
                    transition-all duration-200
                    z-50
                  "
                >
                  <div className="py-1 text-sm">
                    <Link
                      href="/settings"
                      className="block px-4 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      Settings
                    </Link>
                    <button
                      type="button"
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="w-full text-left px-4 py-2 text-red-600 hover:bg-secondary"
                    >
                      Log out
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="text-foreground lg:hidden"
          onClick={() => {
            // ✅ when toggling entire mobile menu closed, also collapse agents
            setMobileOpen((v) => {
              const next = !v;
              if (!next) setMobileAgentsOpen(false);
              return next;
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

      {/* MOBILE PANEL */}
      {mobileOpen && (
        <div className="border-t border-border/40 bg-background/95 backdrop-blur-xl lg:hidden">
          <div className="flex flex-col gap-1 px-6 py-6">
            {navLinks.map((item) => {
              // ✅ On mobile, allow dropdown sections to collapse/expand (Agents)
              if (item.dropdown && item.children?.length) {
                const isAgents = item.label === "Agents";
                const expanded = isAgents ? mobileAgentsOpen : true;

                return (
                  <div key={item.label} className="flex flex-col">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
                      onClick={() => {
                        if (isAgents) setMobileAgentsOpen((v) => !v);
                      }}
                      aria-expanded={expanded}
                      aria-controls={isAgents ? "mobile-agents-panel" : undefined}
                    >
                      <span className="flex items-center gap-1">
                        {item.label}
                      </span>
                      <ChevronDownIcon
                        className={`h-4 w-4 transition-transform ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {expanded && (
                      <div
                        id={isAgents ? "mobile-agents-panel" : undefined}
                        className="ml-3 flex flex-col gap-1 border-l border-border/50 pl-3"
                      >
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
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
                  className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  onClick={() => {
                    setMobileOpen(false);
                    setMobileAgentsOpen(false);
                  }}
                >
                  {item.label}
                </Link>
              );
            })}

            <div className="mt-4 flex flex-col gap-3 border-t border-border/40 pt-4">
              {status === "loading" ? (
                <div className="h-10 w-full animate-pulse rounded-xl bg-secondary" />
              ) : !isAuthed ? (
                <>
                  <Button
                    asChild
                    variant="ghost"
                    className="justify-start text-sm text-muted-foreground hover:bg-secondary"
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

                  <Button asChild className="rounded-full text-sm font-medium">
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
                  <Link
                    href="/settings/subscription"
                    className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800"
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileAgentsOpen(false);
                    }}
                  >
                    {hirePilotDesktopLabel}
                  </Link>

                  <Button
                    asChild
                    variant="ghost"
                    className="justify-start text-sm text-muted-foreground hover:bg-secondary"
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
                    className="rounded-full text-sm font-medium"
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileAgentsOpen(false);
                      signOut({ callbackUrl: "/" });
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
