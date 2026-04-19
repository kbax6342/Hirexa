"use client";

import Link from "next/link";
import {
  ArrowUpTrayIcon,
  BriefcaseIcon,
  CheckBadgeIcon,
  PlayCircleIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

import JobOrdersTable from "@/app/components/recruiter/JobOrdersTable";
import CandidatesTable from "@/app/components/recruiter/CandidatesTable";
import RecruiterCard from "@/app/components/recruiter/RecruiterCard";
import type {
  RecruiterCandidateRecord,
  RecruiterDashboardSummary,
  RecruiterJobOrderRecord,
} from "@/app/components/recruiter/types";

const summaryCards = [
  {
    key: "openJobOrders",
    label: "Open Job Orders",
    icon: BriefcaseIcon,
  },
  {
    key: "totalCandidates",
    label: "Candidates",
    icon: UsersIcon,
  },
  {
    key: "activeSubmissions",
    label: "Active Submissions",
    icon: PlayCircleIcon,
  },
  {
    key: "interviews",
    label: "Interviews",
    icon: ArrowUpTrayIcon,
  },
  {
    key: "placements",
    label: "Placements",
    icon: CheckBadgeIcon,
  },
] as const;

export default function RecruiterDashboardClient({
  summary,
  recentJobOrders,
  recentCandidates,
}: {
  summary: RecruiterDashboardSummary;
  recentJobOrders: RecruiterJobOrderRecord[];
  recentCandidates: RecruiterCandidateRecord[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
            Agency Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Agency workflow with AI-ranked matches
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Keep job orders, candidate intake, ranked fit reasons, and pipeline updates in one recruiter workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/agency/job-orders"
            className="inline-flex items-center rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
          >
            Add job order
          </Link>
          <Link
            href="/agency/candidates"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Upload resumes
          </Link>
          <Link
            href="/agency/profile"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            View profile
          </Link>
          <Link
            href={
              recentJobOrders[0]
                ? `/agency/job-orders/${recentJobOrders[0].id}`
                : "/agency/job-orders"
            }
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Run AI match
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          const value = summary[card.key] ?? 0;
          return (
            <RecruiterCard
              key={card.key}
              className="rounded-2xl border-slate-200 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-500">{card.label}</div>
                  <div className="mt-3 text-3xl font-semibold text-slate-900">{value}</div>
                </div>
                <div className="rounded-xl bg-sky-50 p-3 text-sky-700 ring-1 ring-sky-100">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </RecruiterCard>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <RecruiterCard className="rounded-2xl border-slate-200 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Recent job orders</h2>
              <p className="mt-1 text-sm text-slate-500">
                Open the detail view to run AI match and manage the stage pipeline.
              </p>
            </div>
            <Link
              href="/agency/job-orders"
              className="text-sm font-medium text-sky-600 hover:text-sky-700"
            >
              View all
            </Link>
          </div>
          <JobOrdersTable jobOrders={recentJobOrders} compact />
        </RecruiterCard>

        <RecruiterCard className="rounded-2xl border-slate-200 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Recent candidates</h2>
              <p className="mt-1 text-sm text-slate-500">
                Resume uploads and pasted resumes land here for recruiter review.
              </p>
            </div>
            <Link
              href="/agency/candidates"
              className="text-sm font-medium text-sky-600 hover:text-sky-700"
            >
              View all
            </Link>
          </div>
          <CandidatesTable candidates={recentCandidates} compact />
        </RecruiterCard>
      </div>
    </div>
  );
}
