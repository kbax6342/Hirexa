import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import CompanyChatbotSettingsForm from "@/app/components/chatbot/CompanyChatbotSettingsForm";
import { Card, CardContent } from "@/app/components/ui/card";
import { prisma } from "@/app/lib/prisma";
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
  return <main className="min-h-screen bg-white text-slate-950">{children}</main>;
}

function formatLeadName(lead: { firstName: string | null; lastName: string | null }) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed lead";
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

  const recentLeads = await prisma.chatbotCandidateLead.findMany({
    where: { companyChatbotId: chatbot.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      desiredJobType: true,
      qualificationStatus: true,
      candidateScore: true,
      createdAt: true,
    },
  });

  return (
    <SettingsPageShell>
      <CompanyChatbotSettingsForm mode="edit" initialChatbot={chatbot} />
      <div
        id="candidate-leads"
        className="mx-auto max-w-3xl px-4 pb-10 sm:px-6 lg:px-8"
      >
        <Card className="border-slate-200 bg-white text-black">
          <CardContent className="bg-white p-5 text-black sm:p-6">
            <h2 className="text-lg font-semibold text-black">
              Candidate leads
            </h2>
            <p className="mt-1 text-sm text-black">
              {chatbot.leadCount ?? 0} leads have been captured for this company chatbot.
            </p>
            {recentLeads.length > 0 ? (
              <div className="mt-5 overflow-hidden rounded-md border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-white text-xs uppercase tracking-wide text-black">
                    <tr>
                      <th className="px-4 py-3">Candidate</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white text-black">
                    {recentLeads.map((lead) => (
                      <tr key={lead.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-black">
                            {formatLeadName(lead)}
                          </div>
                          <div className="text-xs text-black">
                            {lead.email || lead.phone || "No contact saved"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-black">
                          {lead.desiredJobType || "Not specified"}
                        </td>
                        <td className="px-4 py-3 text-black">
                          {lead.candidateScore ?? "—"}{" "}
                          {lead.qualificationStatus
                            ? `· ${lead.qualificationStatus}`
                            : ""}
                        </td>
                        <td className="px-4 py-3 text-black">
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-5 rounded-md border border-dashed border-slate-300 bg-white p-5 text-sm text-black">
                No candidate leads have been saved yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsPageShell>
  );
}
