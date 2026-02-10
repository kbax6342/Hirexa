"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import { UserCircleIcon } from "@heroicons/react/24/outline";


export default function SiteHeaderClient() {
  const { data: session, status } = useSession();
  const isAuthed = status === "authenticated";

  return (
    <nav className="relative flex items-center border-b px-10 py-6">
      {/* LEFT: BRAND */}
      <Link href="/" className="flex items-center gap-3">
        <Image
          src="/branding/hirexa-logo.png"
          alt="Hirexa AI logo"
          width={150}
          height={100}
          priority
        />
        <span className="text-2xl font-extrabold tracking-tight">
          Hirexa<span className="text-blue-600"> AI</span>
        </span>
      </Link>

      {/* CENTER: NAV LINKS (ABSOLUTELY CENTERED) */}
      {isAuthed && (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-8 text-sm font-medium">
          <Link href="/dashboard" className="hover:text-blue-600">
            Smart Matches
          </Link>
          <Link href="/dashboard/applications" className="hover:text-blue-600">
            Applications
          </Link>
          <Link href="/profile" className="hover:text-blue-600">
            Profile
          </Link>
          <Link href="/job-tools/generate" className="hover:text-blue-600">
            Job Tools
          </Link>
          <Link href="/job-tools/events" className="hover:text-blue-600">
            Events
          </Link>
        </div>
      )}

      {/* RIGHT: AUTH / ACCOUNT */}
      <div className="ml-auto flex items-center gap-6 text-sm font-medium">
        {status === "loading" ? (
          <div className="h-8 w-24 rounded-full bg-gray-100 animate-pulse" />
        ) : !isAuthed ? (
          <>
            <Link href="/jobs" className="hover:text-blue-600">
              Find Jobs
            </Link>
            <Link href="/locations" className="hover:text-blue-600">
              Job Locations
            </Link>
            <Link href="/resources" className="hover:text-blue-600">
              Job Resources
            </Link>
            <Link
              href="/login"
              className="rounded-full border px-4 py-2 hover:bg-gray-100"
            >
              Sign In
            </Link>
          </>
        ) : (
          <div className="relative group">
            {/* Trigger */}
            <div className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-blue-600 hover:underline">
              <UserCircleIcon className="h-5 w-5 text-blue-600" />
              <span>{session.user?.name || session.user?.email}</span>
            </div>


           {/* ✅ Hover buffer to prevent flicker (fills the gap between name and menu) */}
  <div className="absolute right-0 top-full h-3 w-40" />

          {/* Dropdown */}
          <div
            className="
              absolute right-0 top-full mt-2 w-40 rounded-lg border border-gray-200 bg-white shadow-lg
              opacity-0 scale-95 pointer-events-none
              group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto
              transition-all duration-200
              z-50
            "
          >
            <ul className="flex flex-col py-1 text-sm text-gray-700">
              <li>
                <Link
                  href="/settings"
                  className="block px-4 py-2 hover:bg-gray-300"
                >
                  Settings
                </Link>
              </li>

              <li>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full text-left px-4 py-2 text-red-600 hover:bg-gray-300"
                >
                  Log out
                </button>
              </li>
            </ul>
          </div>
          </div>
        )}
      </div>
    </nav>
  );
}
