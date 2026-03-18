"use client";

import { signOut } from "next-auth/react";
import { clearAppliedJobsSession } from "@/app/lib/appliedJobsSession";

export default function SignOutButton() {
  return (
    <button
      onClick={() => {
        clearAppliedJobsSession();
        void signOut({ callbackUrl: "/" });
      }}
      className="rounded-full border px-4 py-2 transition hover:bg-gray-100"
    >
      Sign Out
    </button>
  );
}
