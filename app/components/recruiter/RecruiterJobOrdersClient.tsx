"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

import JobOrderForm from "@/app/components/recruiter/JobOrderForm";
import JobOrdersTable from "@/app/components/recruiter/JobOrdersTable";
import RecruiterCard from "@/app/components/recruiter/RecruiterCard";
import type { RecruiterJobOrderRecord } from "@/app/components/recruiter/types";

export default function RecruiterJobOrdersClient({
  initialJobOrders,
}: {
  initialJobOrders: RecruiterJobOrderRecord[];
}) {
  const [jobOrders, setJobOrders] = useState(initialJobOrders);
  const [editing, setEditing] = useState<RecruiterJobOrderRecord | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filteredJobOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return jobOrders;
    return jobOrders.filter((jobOrder) =>
      [
        jobOrder.title,
        jobOrder.companyName,
        jobOrder.location ?? "",
        ...(jobOrder.requiredSkills ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [jobOrders, search]);

  function handleSaved(jobOrder: RecruiterJobOrderRecord) {
    setError(null);
    setEditing(null);
    setJobOrders((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === jobOrder.id);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], ...jobOrder };
        return next.sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        );
      }

      return [jobOrder, ...prev];
    });
  }

  async function handleDelete(jobOrder: RecruiterJobOrderRecord) {
    const confirmed = window.confirm(`Delete ${jobOrder.title}?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/recruiter/job-orders/${jobOrder.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error ?? "Unable to delete job order.");
      }

      setJobOrders((prev) => prev.filter((item) => item.id !== jobOrder.id));
      if (editing?.id === jobOrder.id) {
        setEditing(null);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete job order.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
          Job Orders
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Intake roles and launch ranked candidate matching
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Create, edit, and maintain recruiter job orders so the AI matcher has clean requirements to work from.
        </p>
      </div>

      <JobOrderForm
        initialJobOrder={editing}
        onSaved={handleSaved}
        onCancel={editing ? () => setEditing(null) : undefined}
      />

      <RecruiterCard className="rounded-2xl border-slate-200 p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">All job orders</h2>
            <p className="mt-1 text-sm text-slate-500">
              Open any role to run candidate ranking, view fit reasons, and update stages.
            </p>
          </div>

          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 !bg-white px-3 py-2 text-sm text-slate-500">
            <MagnifyingGlassIcon className="h-4 w-4" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-56 border-0 bg-transparent text-slate-900 outline-none"
              placeholder="Search job orders"
            />
          </label>
        </div>

        {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

        <JobOrdersTable
          jobOrders={filteredJobOrders}
          onEdit={(jobOrder) => setEditing(jobOrder)}
          onDelete={(jobOrder) => void handleDelete(jobOrder)}
        />
      </RecruiterCard>
    </div>
  );
}
