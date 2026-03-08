import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type BenefitsLayoutProps = {
  children: ReactNode;
};

export default function BenefitsLayout({ children }: BenefitsLayoutProps) {
  return children;
}
