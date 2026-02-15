"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ApplicationStatus =
  | "IN_PREPARATION"
  | "READY_TO_SEND"
  | "IN_PROGRESS"
  | "SENT";

type JobApplication = {
  id: string;
  jobTitle: string;
  company: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
};

const STATUS_OPTIONS: Array<{ value: ApplicationStatus; label: string }> = [
  { value: "IN_PREPARATION", label: "In preperation" },
  { value: "READY_TO_SEND", label: "Ready to send" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "SENT", label: "Sent" },
];

export default function ApplicationsPage() {
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("IN_PREPARATION");
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const statusLabelMap = useMemo(
    () => new Map(STATUS_OPTIONS.map((option) => [option.value, option.label])),
    []
  );

  async function loadApplications() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/applications", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error ?? "Failed to load applications.");
        return;
      }

      setApplications(data.applications ?? []);
    } catch {
      setMessage("Unable to load applications right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadApplications();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle,
          company,
          status,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error ?? "Could not save application.");
        return;
      }

      setApplications((prev) => [data.application, ...prev]);
      setJobTitle("");
      setCompany("");
      setStatus("IN_PREPARATION");
      setMessage("Application saved to database.");
    } catch {
      setMessage("Could not save application.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, nextStatus: ApplicationStatus) {
    const prev = applications;
    setApplications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: nextStatus, updatedAt: new Date().toISOString() } : item
      )
    );

    const res = await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (!res.ok) {
      setApplications(prev);
      setMessage("Unable to update status.");
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-gray-900">Applications</h1>
      <p className="mt-2 text-sm text-gray-600">
        Track and store your job applications by status.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900">Add job application</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm text-gray-700">
            Job title
            <input
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="Software Engineer"
              required
            />
          </label>

          <label className="text-sm text-gray-700">
            Company
            <input
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="Acme Inc"
              required
            />
          </label>

          <label className="text-sm text-gray-700">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ApplicationStatus)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-5 rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save application"}
        </button>
      </form>

      {message ? <p className="mt-4 text-sm text-gray-700">{message}</p> : null}

      <section className="mt-8">
        <h2 className="text-lg font-medium text-gray-900">Saved applications</h2>

        {loading ? (
          <p className="mt-3 text-sm text-gray-600">Loading applications...</p>
        ) : applications.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No applications saved yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {applications.map((application) => (
              <li key={application.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{application.jobTitle}</p>
                    <p className="text-sm text-gray-600">{application.company}</p>
                  </div>

                  <select
                    value={application.status}
                    onChange={(event) => updateStatus(application.id, event.target.value as ApplicationStatus)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="mt-2 text-xs text-gray-500">
                  Last updated: {new Date(application.updatedAt).toLocaleString()} • Current status:{" "}
                  {statusLabelMap.get(application.status) ?? application.status}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
