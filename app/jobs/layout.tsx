import type { Metadata } from "next";
import type { ReactNode } from "react";

import SensitiveContent from "@/app/components/SensitiveContent";

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
  return <SensitiveContent mode="replace">{children}</SensitiveContent>;
}
