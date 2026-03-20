import type { Metadata } from "next";

import MarketingPageShell from "@/app/components/marketing/MarketingPageShell";
import { marketingPages } from "@/app/components/marketing/marketingContent";

const pageContent = marketingPages.about;

export const metadata: Metadata = pageContent.metadata;

export default function AboutPage() {
  return <MarketingPageShell page={pageContent} />;
}
