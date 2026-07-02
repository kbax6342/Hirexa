import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardDocumentListIcon } from "@heroicons/react/24/outline";

import CompanyChatbotSettingsForm from "@/app/components/chatbot/CompanyChatbotSettingsForm";
import { Button } from "@/app/components/ui/button";
import { getCompanyChatbotBySlug } from "@/lib/chatbot/getCompanyChatbot";
import {
  getHomepageCompanyChatbotRecord,
  HOMEPAGE_COMPANY_CHATBOT_SLUG,
} from "@/lib/chatbot/homepageChatbotSettings";

type ChatbotSettingsPageProps = {
  params: Promise<{
    companySlug: string;
  }>;
};

export const dynamic = "force-dynamic";

function SettingsPageShell({ children }: { children: ReactNode }) {
  return <main className="min-h-screen bg-white text-black">{children}</main>;
}

export default async function ChatbotSettingsPage({
  params,
}: ChatbotSettingsPageProps) {
  const { companySlug } = await params;

  const chatbot = await getCompanyChatbotBySlug(companySlug);
  if (!chatbot) {
    if (companySlug === HOMEPAGE_COMPANY_CHATBOT_SLUG) {
      return (
        <SettingsPageShell>
          <CompanyChatbotSettingsForm
            mode="create"
            initialChatbot={getHomepageCompanyChatbotRecord()}
          />
        </SettingsPageShell>
      );
    }

    notFound();
  }

  return (
    <SettingsPageShell>
      <CompanyChatbotSettingsForm mode="edit" initialChatbot={chatbot} />
      <div className="mx-auto max-w-5xl bg-white px-4 pb-10 text-black sm:px-6 lg:px-8">
        <Button
          asChild
          variant="outline"
          className="border-black bg-white text-black hover:bg-white hover:text-black"
        >
          <Link href={`/dashboard/chatbots/${chatbot.companySlug}/bot-dashboard`}>
            <ClipboardDocumentListIcon className="h-4 w-4" />
            View Bot Dashboard
          </Link>
        </Button>
      </div>
    </SettingsPageShell>
  );
}
