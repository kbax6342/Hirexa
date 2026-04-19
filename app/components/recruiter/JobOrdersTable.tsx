"use client";

import Link from "next/link";
import {
  ArrowTopRightOnSquareIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import type { RecruiterJobOrderRecord } from "@/app/components/recruiter/types";

function formatMoney(value: number | null | undefined) {
  if (value == null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export default function JobOrdersTable({
  jobOrders,
  onEdit,
  onDelete,
  compact = false,
}: {
  jobOrders: RecruiterJobOrderRecord[];
  onEdit?: (jobOrder: RecruiterJobOrderRecord) => void;
  onDelete?: (jobOrder: RecruiterJobOrderRecord) => void;
  compact?: boolean;
}) {
  if (!jobOrders.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 !bg-white px-5 py-10 text-center text-sm text-slate-500">
        No job orders yet. Add your first role to start ranking candidates.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-slate-500">Role</TableHead>
          <TableHead className="text-slate-500">Location</TableHead>
          {!compact ? <TableHead className="text-slate-500">Comp</TableHead> : null}
          <TableHead className="text-slate-500">Status</TableHead>
          <TableHead className="text-slate-500">Updated</TableHead>
          <TableHead className="text-right text-slate-500">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobOrders.map((jobOrder) => (
          <TableRow key={jobOrder.id} className="hover:bg-slate-50">
            <TableCell>
              <div className="min-w-[220px]">
                <div className="font-semibold text-slate-900">{jobOrder.title}</div>
                <div className="text-xs text-slate-500">{jobOrder.companyName}</div>
              </div>
            </TableCell>
            <TableCell className="text-slate-600">
              {jobOrder.location || "Flexible / not specified"}
            </TableCell>
            {!compact ? (
              <TableCell className="text-slate-600">
                {formatMoney(jobOrder.salaryMin) && formatMoney(jobOrder.salaryMax)
                  ? `${formatMoney(jobOrder.salaryMin)} - ${formatMoney(jobOrder.salaryMax)}`
                  : formatMoney(jobOrder.salaryMin) || formatMoney(jobOrder.salaryMax) || "Not listed"}
              </TableCell>
            ) : null}
            <TableCell>
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                {jobOrder.status}
              </span>
            </TableCell>
            <TableCell className="text-slate-500">{formatDate(jobOrder.updatedAt)}</TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-2">
                <Link
                  href={`/agency/job-orders/${jobOrder.id}`}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </Link>
                {onEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(jobOrder)}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(jobOrder)}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100"
                  >
                    <TrashIcon className="h-4 w-4" />
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
