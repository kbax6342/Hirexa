import type { Metadata } from "next";
import type { ReactNode } from "react";

import SensitiveContent from "@/app/components/SensitiveContent";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

type JobToolsLayoutProps = {
  children: ReactNode;
};

export default function JobToolsLayout({ children }: JobToolsLayoutProps) {
  return <SensitiveContent mode="replace">{children}</SensitiveContent>;
}
