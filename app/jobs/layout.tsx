import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

type JobsLayoutProps = {
  children: ReactNode;
};

export default function JobsLayout({ children }: JobsLayoutProps) {
  return children;
}
