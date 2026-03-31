import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

type QuestionsLayoutProps = {
  children: ReactNode;
};

export default function QuestionsLayout({ children }: QuestionsLayoutProps) {
  return children;
}
