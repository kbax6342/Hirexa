"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";



export default function SiteHeaderClient() {
  const { data: session, status } = useSession();

  const isAuthed = status === "authenticated";
  const label =
    session?.user?.name || session?.user?.email || "Account";

  return (
    <nav className="flex items-center justify-between w-full border-b px-10 py-6">
     
  {/* LEFT: BRAND */}
  <Link href="/" className="flex items-center gap-3">
    {/* Optional logo */}
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
      {/* <div className="flex items-center gap-6 text-sm font-medium">
        <Link href="/jobs" prefetch={false}>Find Jobs</Link>
        <Link href="/locations">Job Locations</Link>
        <Link href="/resources">Job Resources</Link>

        {status === "loading" ? (
          <div className="h-10 w-28 rounded-full bg-gray-100 animate-pulse" />
        ) : !isAuthed ? (
          <Link
            href="/login"
            className="rounded-full border px-4 py-2 transition hover:bg-gray-100"
          >
            Sign In
          </Link>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4">

        <Link href="/jobs" prefetch={false}>Find Jobs</Link>
        <Link href="/locations">Job Locations</Link>
        <Link href="/resources">Job Resources</Link>
          <Link
            href="/dashboard"
            className="text-white  transition"
          >
            Hi,This is the one showing {session.user?.name || session.user?.email}
          </Link>
        
          
        </div>

            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded-full border px-4 py-2 transition hover:bg-gray-100"
            >
              Sign Out
            </button>
          </div>
        )}
      </div> */}
      <div className="flex items-center gap-6 text-sm font-medium">
  {status === "loading" ? (
    <div className="h-10 w-28 rounded-full bg-gray-100 animate-pulse" />
  ) : !isAuthed ? (
    <>
      {/* Signed OUT links */}
      <Link href="/jobs" prefetch={false} className="hover:text-blue-600">
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
        className="rounded-full border px-4 py-2 transition hover:bg-gray-100"
      >
        Sign In
      </Link>
    </>
  ) : (
    <>
      {/* Signed IN links */}
      <Link href="/dashboard/matches" className="hover:text-blue-600">
        Job Matches
      </Link>
      <Link href="/dashboard/applications" className="hover:text-blue-600">
        Applications
      </Link>
      <Link href="/dashboard/profile" className="hover:text-blue-600">
        Profile
      </Link>

      {/* Optional: greeting goes to dashboard */}
      <Link href="/dashboard" className="font-semibold text-blue-600 hover:underline">
        Hi, {session.user?.name || session.user?.email}
      </Link>

      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-full border px-4 py-2 transition hover:bg-gray-100"
      >
        Sign Out
      </button>
    </>
  )}
</div>
    </nav>
  );
}
