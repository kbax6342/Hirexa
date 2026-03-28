"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdzunaAttribution from "@/app/components/jobs/AdzunaAttribution";

type AdzunaJob = {
  source: "adzuna";
  sourceJobId: string;
  title: string;
  company: string;
  location: string;
  jobUrl: string;
  descriptionSnippet: string;
};

export default function AdzunaJobsPage() {
  const router = useRouter();
  const [q, setQ] = useState("software engineer");
  const [location, setLocation] = useState("");
  const [jobs, setJobs] = useState<AdzunaJob[]>([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    try {
      const url = new URL("/api/jobs/adzuna/search", window.location.origin);
      url.searchParams.set("q", q);
      if (location) url.searchParams.set("location", location);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function openAudit(job: AdzunaJob) {
    const res = await fetch("/api/job-applications/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(job),
    });

    const payload = await res.json();
    if (payload?.applicationId) {
      router.push(`/applications/${payload.applicationId}/audit`);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold">Adzuna Jobs</h1>
      <div className="mt-3 flex gap-2">
        <input className="rounded border px-3 py-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
        <input className="rounded border px-3 py-2" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" />
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={search} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {jobs.map((job) => (
          <div key={job.sourceJobId} className="rounded border p-3">
            <div className="font-medium">{job.title}</div>
            <div className="text-sm text-gray-600">{job.company} • {job.location}</div>
            <p className="mt-2 text-sm text-gray-700">{job.descriptionSnippet}</p>
            <AdzunaAttribution className="mt-3" />
            <button className="mt-2 rounded border px-3 py-1 text-sm" onClick={() => openAudit(job)}>
              Open Audit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
