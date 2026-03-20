import type { Metadata } from "next";

import MarketingPageShell from "@/app/components/marketing/MarketingPageShell";
import { marketingPages } from "@/app/components/marketing/marketingContent";

const pageContent = marketingPages.features;

export const metadata: Metadata = pageContent.metadata;

export default function FeaturesPage() {
  return <MarketingPageShell page={pageContent} />;
}
