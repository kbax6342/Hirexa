"use client";

// Generic passthrough provider slot for app-wide wrappers that are not auth-related.
export default function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
