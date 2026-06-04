import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";

import StaffingAiDemoShowcase from "@/app/components/demo/StaffingAiDemoShowcase";
import { Button } from "@/app/components/ui/button";
import { getCompanyChatbotSettingsBySlug } from "@/lib/chatbot/getCompanyChatbot";

type DemoPageProps = {
  params: Promise<{
    companySlug: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: DemoPageProps): Promise<Metadata> {
  const { companySlug } = await params;
  const chatbot = await getCompanyChatbotSettingsBySlug(companySlug);

  if (!chatbot) {
    return {
      title: "Company Chatbot Demo | Hirexa AI",
    };
  }

  return {
    title: `${chatbot.companyName} Chatbot Demo | Hirexa AI`,
    description:
      chatbot.companyDescription ||
      "A reusable Hirexa AI company chatbot demo loaded from saved chatbot settings.",
  };
}

export default async function CompanyChatbotDemoPage({ params }: DemoPageProps) {
  const { companySlug } = await params;
  const chatbot = await getCompanyChatbotSettingsBySlug(companySlug);

  if (!chatbot || !chatbot.isActive) {
    notFound();
  }

  const settings = chatbot.aiChatSettings;
  const accentColor = settings.brandPrimaryColor || "#0284c7";
  const logoUrl = settings.companyLogoUrl?.trim();

  return (
    <main className="min-h-screen bg-slate-50 pt-20 text-slate-950 sm:pt-24">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white text-lg font-semibold text-white"
              style={{ borderColor: accentColor, backgroundColor: accentColor }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                chatbot.companyName.slice(0, 1).toUpperCase()
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">
                {settings.chatTitle || settings.chatDisplayName}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                {chatbot.companyName}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {settings.chatSubtitle || "Candidate screening assistant"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/chatbots">
                <ArrowLeftIcon className="h-4 w-4" />
                Back to chatbots
              </Link>
            </Button>
            <Button asChild style={{ backgroundColor: accentColor }}>
              <Link href={`/dashboard/chatbots/${chatbot.companySlug}/settings`}>
                <Cog6ToothIcon className="h-4 w-4" />
                Edit company setup
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <StaffingAiDemoShowcase
          companySlug={chatbot.companySlug}
          companySettings={settings}
        />
      </section>
    </main>
  );
}
