"use client";
import { authClient } from "@/lib/auth/client";

export default function SignOutButton() {
  return (
    <button
      onClick={() => authClient.signOut().then(() => window.location.replace("/"))}
      className="rounded-full border px-4 py-2 transition hover:bg-gray-100"
    >
      Sign Out
    </button>
  );
}
