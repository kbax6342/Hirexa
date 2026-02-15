// components/nav/LoggedInNav.tsx
import Link from "next/link";
import SignOutButton from "../../components/signOutButton/SignOutButton"; // adjust path if needed

export default function LoggedInNav({ userName }: { userName: string }) {
  return (
    <nav className="flex items-center gap-2">
      <Link
        href="/dashboard"
        className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Dashboard
      </Link>

      <Link
        href="/applications"
        className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Applications
      </Link>

      <Link
        href="/saved"
        className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Saved jobs
      </Link>

      <div className="ml-2 flex items-center gap-3 border-l pl-3">
        <span className="hidden text-sm text-gray-700 sm:block">
          Hi, <strong>{userName}</strong>
        </span>
        <SignOutButton />
      </div>
    </nav>
  );
}
