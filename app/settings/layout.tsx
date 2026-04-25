import type { Metadata } from "next";
import type { ReactNode } from "react";
import AppliedJobsPopout from "@/app/components/apply/AppliedJobsPopout";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

type SettingsLayoutProps = {
  children: ReactNode;
};

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <>
      {children}
      <AppliedJobsPopout buttonId="applied-jobs-popout-toggle-settings" />
    </>
  );
}
