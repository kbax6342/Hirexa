import type { Metadata } from "next";
import type { ReactNode } from "react";

import SensitiveContent from "@/app/components/SensitiveContent";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

type HirePilotLayoutProps = {
  children: ReactNode;
};

export default function HirePilotLayout({ children }: HirePilotLayoutProps) {
  return <SensitiveContent mode="replace">{children}</SensitiveContent>;
}
