// File: /Hirexa/my-app/components/navbar.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "../components/ui/button";
import { Bars3Icon, XMarkIcon, ChevronDownIcon, UserCircleIcon } from "@heroicons/react/24/outline";

type NavItem = { label: string; href: string; dropdown?: boolean };

const guestNav: NavItem[] = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Find Jobs", href: "/jobs" },
  { label: "Job Locations", href: "/locations" },
  { label: "Job Resources", href: "/resources", dropdown: true },
];

const authedNav: NavItem[] = [
  { label: "Smart Matches", href: "/dashboard" },
  { label: "Applications", href: "/dashboard/applications" },
  { label: "Profile", href: "/profile" },
  { label: "Job Tools", href: "/job-tools/generate" },
  { label: "Events", href: "/job-tools/events" },
];

export function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isAuthed = status === "authenticated";
  const [mobileOpen, setMobileOpen] = useState(false);
  const signInHref = `/api/auth/signin?callbackUrl=${encodeURIComponent(pathname || "/")}`;

  const navLinks = isAuthed ? authedNav : guestNav;

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
        <div className="hidden items-center gap-7 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
              {link.dropdown && <ChevronDownIcon className="h-4 w-4" />}
            </Link>
          ))}
        </div>

        {/* RIGHT: AUTH / ACCOUNT (desktop) */}
        <div className="hidden items-center gap-3 lg:flex">
          {status === "loading" ? (
            <div className="h-9 w-28 animate-pulse rounded-full bg-secondary" />
          ) : !isAuthed ? (
            <>
              

              <Button asChild className="rounded-full px-6 text-sm font-medium">
                <Link href={signInHref}>Sign In</Link>
              </Button>
            </>
          ) : (
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
          )}
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="text-foreground lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
        </button>
      </nav>

      {/* MOBILE PANEL */}
      {mobileOpen && (
        <div className="border-t border-border/40 bg-background/95 backdrop-blur-xl lg:hidden">
          <div className="flex flex-col gap-1 px-6 py-6">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
                {link.dropdown && <ChevronDownIcon className="h-4 w-4" />}
              </Link>
            ))}

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
                    <Link href={signInHref} onClick={() => setMobileOpen(false)}>
                      Sign In
                    </Link>
                  </Button>

                  <Button asChild className="rounded-full text-sm font-medium">
                    <Link href={signInHref} onClick={() => setMobileOpen(false)}>
                      Get Started
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    asChild
                    variant="ghost"
                    className="justify-start text-sm text-muted-foreground hover:bg-secondary"
                  >
                    <Link href="/settings" onClick={() => setMobileOpen(false)}>
                      Settings
                    </Link>
                  </Button>

                  <Button
                    variant="destructive"
                    className="rounded-full text-sm font-medium"
                    onClick={() => signOut({ callbackUrl: "/" })}
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
