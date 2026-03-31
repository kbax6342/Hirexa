import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

type OnboardingLayoutProps = {
  children: ReactNode;
};

export default function OnboardingLayout({ children }: OnboardingLayoutProps) {
  return children;
}
