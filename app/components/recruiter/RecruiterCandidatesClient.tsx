"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

import CandidateUploadCard from "@/app/components/recruiter/CandidateUploadCard";
import CandidatesTable from "@/app/components/recruiter/CandidatesTable";
import RecruiterCard from "@/app/components/recruiter/RecruiterCard";
import type { RecruiterCandidateRecord } from "@/app/components/recruiter/types";

function buildCandidateName(candidate: RecruiterCandidateRecord) {
  const parts = [candidate.firstName, candidate.lastName]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" ");
  return candidate.email || "Unnamed candidate";
}

export default function RecruiterCandidatesClient({
  initialCandidates,
}: {
  initialCandidates: RecruiterCandidateRecord[];
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    initialCandidates[0]?.id ?? null
  );
  const [search, setSearch] = useState("");

  const filteredCandidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return candidates;
    return candidates.filter((candidate) =>
      [
        candidate.firstName ?? "",
        candidate.lastName ?? "",
        candidate.email ?? "",
        candidate.headline ?? "",
        candidate.location ?? "",
        ...(candidate.skills ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [candidates, search]);

  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null;

  function handleUploaded(candidate: RecruiterCandidateRecord) {
    setCandidates((prev) => [candidate, ...prev]);
    setSelectedCandidateId(candidate.id);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
          Candidates
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Import resumes and review recruiter-ready candidate snapshots
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Candidate uploads save parsed skills, resume text, source, and summary fields so matching and outreach can move faster.
        </p>
      </div>

      <CandidateUploadCard onUploaded={handleUploaded} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <RecruiterCard className="rounded-2xl border-slate-200 p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Candidate roster</h2>
              <p className="mt-1 text-sm text-slate-500">
                Browse uploaded resumes and open a candidate detail panel for parsed context.
              </p>
            </div>

            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
              <MagnifyingGlassIcon className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-56 border-0 bg-transparent text-slate-900 outline-none"
                placeholder="Search candidates"
              />
            </label>
          </div>

          <CandidatesTable
            candidates={filteredCandidates}
            onSelect={(candidate) => setSelectedCandidateId(candidate.id)}
            selectedCandidateId={selectedCandidateId}
          />
        </RecruiterCard>

        <RecruiterCard className="rounded-2xl border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900">Candidate detail</h2>
          {selectedCandidate ? (
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">
                  {buildCandidateName(selectedCandidate)}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {selectedCandidate.headline || selectedCandidate.email || "Candidate record"}
                </div>
              </div>

              <div className="grid gap-3 text-sm text-slate-600">
                <div>
                  <div className="font-medium text-slate-900">Location</div>
                  <div>{selectedCandidate.location || "Not specified"}</div>
                </div>
                <div>
                  <div className="font-medium text-slate-900">Phone</div>
                  <div>{selectedCandidate.phone || "Not specified"}</div>
                </div>
                <div>
                  <div className="font-medium text-slate-900">Years Experience</div>
                  <div>
                    {selectedCandidate.yearsExperience != null
                      ? `${selectedCandidate.yearsExperience}+ years`
                      : "Not estimated yet"}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-slate-900">Skills</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(selectedCandidate.skills ?? []).length ? (
                      selectedCandidate.skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                        >
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">No parsed skills yet</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-slate-900">Resume text preview</div>
                  <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-sm">
                    {selectedCandidate.resumeText
                      ? `${selectedCandidate.resumeText.slice(0, 700)}${selectedCandidate.resumeText.length > 700 ? "..." : ""}`
                      : "Resume text was not available for this upload."}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Select a candidate from the roster to review parsed details.
            </div>
          )}
        </RecruiterCard>
      </div>
    </div>
  );
}
