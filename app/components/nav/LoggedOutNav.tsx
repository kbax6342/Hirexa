// components/nav/LoggedOutNav.tsx
import Link from "next/link";

export default function LoggedOutNav() {
  return (
    <nav className="flex items-center gap-2">
        <Link
            href="/jobs"
            className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
            Find Jobs
        </Link>

        <Link
            href="/locations"
            className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
            Find Locations
        </Link>

        <Link
            href="/login"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
        >
            Sign In
        </Link>
    </nav>
  );
}
