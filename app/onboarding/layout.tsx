import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type OnboardingLayoutProps = {
  children: ReactNode;
};

export default function OnboardingLayout({ children }: OnboardingLayoutProps) {
  return children;
}
