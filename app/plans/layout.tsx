import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type PlansLayoutProps = {
  children: ReactNode;
};

export default function PlansLayout({ children }: PlansLayoutProps) {
  return children;
}
