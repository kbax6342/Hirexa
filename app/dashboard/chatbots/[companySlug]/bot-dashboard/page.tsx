import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

import CandidateLeadsTable from "@/app/components/chatbot/CandidateLeadsTable";
import { Button } from "@/app/components/ui/button";
import { prisma } from "@/app/lib/prisma";
import { getCompanyChatbotBySlug } from "@/lib/chatbot/getCompanyChatbot";

type BotDashboardPageProps = {
  params: Promise<{
    companySlug: string;
  }>;
};

export const dynamic = "force-dynamic";

function getLeadDedupKey(lead: {
  id: string;
  email: string | null;
  phone: string | null;
}) {
  const email = lead.email?.trim().toLowerCase();
  if (email) return `email:${email}`;

  const phone = lead.phone?.replace(/\D/g, "");
  if (phone) return `phone:${phone}`;

  return `id:${lead.id}`;
}

function dedupeLeadsByContact<T extends { id: string; email: string | null; phone: string | null }>(
  leads: T[]
) {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const lead of leads) {
    const key = getLeadDedupKey(lead);
    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push(lead);
  }

  return deduped;
}

export default async function BotDashboardPage({
  params,
}: BotDashboardPageProps) {
  const { companySlug } = await params;
  const chatbot = await getCompanyChatbotBySlug(companySlug);

  if (!chatbot) {
    notFound();
  }

  const leads = await prisma.chatbotCandidateLead.findMany({
    where: { companyChatbotId: chatbot.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      city: true,
      state: true,
      zipCode: true,
      desiredJobType: true,
      employmentType: true,
      preferredShift: true,
      availability: true,
      workExperienceSummary: true,
      transportationStatus: true,
      workAuthorization: true,
      resumeUrl: true,
      linkedinUrl: true,
      certifications: true,
      desiredPay: true,
      startDate: true,
      previousEmployer: true,
      educationLevel: true,
      languagesSpoken: true,
      veteranStatus: true,
      referralSource: true,
      contactConsent: true,
      qualificationStatus: true,
      captureStatus: true,
      candidateScore: true,
      aiSummary: true,
      structuredAnswersJson: true,
      createdAt: true,
    },
  });
  const dedupedLeads = dedupeLeadsByContact(leads);

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-7xl px-4 py-8 text-black sm:px-6 lg:px-8">
        <div className="mb-6 mt-[60px] flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Button
              asChild
              variant="ghost"
              className="-ml-3 mb-3 bg-white text-black hover:bg-white hover:text-black"
            >
              <Link href={`/dashboard/chatbots/${chatbot.companySlug}/settings`}>
                <ArrowLeftIcon className="h-4 w-4" />
                Back to Settings
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              Bot Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Review candidate leads captured by {chatbot.companyName}.
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="border-slate-300 bg-white text-black hover:bg-slate-50 hover:text-black"
          >
            <Link href={`/dashboard/chatbots/${chatbot.companySlug}/settings`}>
              <Cog6ToothIcon className="h-4 w-4" />
              Settings
            </Link>
          </Button>
        </div>

        <CandidateLeadsTable
          companySlug={chatbot.companySlug}
          leads={dedupedLeads.slice(0, 50)}
          totalLeads={dedupedLeads.length}
        />
      </div>
    </main>
  );
}
