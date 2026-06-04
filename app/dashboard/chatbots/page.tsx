import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

import { auth } from "@/auth";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { listCompanyChatbots } from "@/lib/chatbot/getCompanyChatbot";

export const dynamic = "force-dynamic";

export default async function ChatbotsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/dashboard/chatbots");
  }

  const chatbots = await listCompanyChatbots();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Company chatbots
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Reusable Hirexa AI chatbot setups for demos, embeds, screening, and lead routing.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/chatbots/new">
            <PlusIcon className="h-4 w-4" />
            New chatbot
          </Link>
        </Button>
      </div>

      {chatbots.length === 0 ? (
        <Card className="border-dashed border-slate-300">
          <CardContent className="flex flex-col items-center px-6 py-12 text-center">
            <ChatBubbleLeftRightIcon className="h-10 w-10 text-slate-400" />
            <h2 className="mt-4 text-lg font-semibold text-slate-950">
              No company chatbots yet
            </h2>
            <p className="mt-2 max-w-md text-sm text-slate-500">
              Create a setup once, then reuse it in demos, widgets, screening flows,
              and recruiter lead views.
            </p>
            <Button asChild className="mt-5">
              <Link href="/dashboard/chatbots/new">Create chatbot</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Jobs</th>
                <th className="px-4 py-3">Leads</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {chatbots.map((chatbot) => (
                <tr key={chatbot.id}>
                  <td className="px-4 py-4">
                    <div className="font-medium text-slate-950">
                      {chatbot.companyName}
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {chatbot.companySlug}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge className="border-slate-200 bg-white text-slate-700">
                        {chatbot.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {chatbot.isDemoMode ? (
                        <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                          Demo
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-700">{chatbot.jobs.length}</td>
                  <td className="px-4 py-4 text-slate-700">
                    {chatbot.leadCount ?? 0}
                  </td>
                  <td className="px-4 py-4 text-slate-500">
                    {new Date(chatbot.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/demo/${chatbot.companySlug}`} target="_blank">
                          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                          Demo
                        </Link>
                      </Button>
                      <Button asChild size="sm">
                        <Link href={`/dashboard/chatbots/${chatbot.companySlug}/settings`}>
                          Settings
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
