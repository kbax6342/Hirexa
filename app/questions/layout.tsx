import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type QuestionsLayoutProps = {
  children: ReactNode;
};

export default function QuestionsLayout({ children }: QuestionsLayoutProps) {
  return children;
}
