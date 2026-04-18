"use client";

import { useMemo } from "react";
import { ChevronRightIcon } from "@heroicons/react/24/outline";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import type { RecruiterCandidateRecord } from "@/app/components/recruiter/types";

function buildCandidateName(candidate: RecruiterCandidateRecord) {
  const parts = [candidate.firstName, candidate.lastName]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" ");
  return candidate.email || "Unnamed candidate";
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export default function CandidatesTable({
  candidates,
  onSelect,
  selectedCandidateId,
  compact = false,
}: {
  candidates: RecruiterCandidateRecord[];
  onSelect?: (candidate: RecruiterCandidateRecord) => void;
  selectedCandidateId?: string | null;
  compact?: boolean;
}) {
  const rows = useMemo(() => candidates, [candidates]);

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
        No candidates yet. Upload resumes or paste raw resume text to start matching.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-slate-500">Candidate</TableHead>
          {!compact ? <TableHead className="text-slate-500">Skills</TableHead> : null}
          <TableHead className="text-slate-500">Location</TableHead>
          <TableHead className="text-slate-500">Source</TableHead>
          <TableHead className="text-slate-500">Updated</TableHead>
          <TableHead className="text-right text-slate-500">View</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((candidate) => (
          <TableRow
            key={candidate.id}
            className={
              selectedCandidateId === candidate.id
                ? "border-sky-200 bg-sky-50/50 hover:bg-sky-50/50"
                : "hover:bg-slate-50"
            }
          >
            <TableCell>
              <div className="min-w-[220px]">
                <div className="font-semibold text-slate-900">{buildCandidateName(candidate)}</div>
                <div className="text-xs text-slate-500">
                  {candidate.headline || candidate.email || "Profile details still loading"}
                </div>
              </div>
            </TableCell>
            {!compact ? (
              <TableCell className="text-slate-600">
                <div className="flex flex-wrap gap-1.5">
                  {(candidate.skills ?? []).slice(0, 4).map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                    >
                      {skill}
                    </span>
                  ))}
                  {!candidate.skills?.length ? (
                    <span className="text-xs text-slate-400">No parsed skills yet</span>
                  ) : null}
                </div>
              </TableCell>
            ) : null}
            <TableCell className="text-slate-600">
              {candidate.location || "Not specified"}
            </TableCell>
            <TableCell>
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                {candidate.source || "UPLOAD"}
              </span>
            </TableCell>
            <TableCell className="text-slate-500">{formatDate(candidate.updatedAt)}</TableCell>
            <TableCell>
              <div className="flex justify-end">
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(candidate)}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
