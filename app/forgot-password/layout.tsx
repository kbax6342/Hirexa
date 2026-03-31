import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

type ForgotPasswordLayoutProps = {
  children: ReactNode;
};

export default function ForgotPasswordLayout({
  children,
}: ForgotPasswordLayoutProps) {
  return children;
}
