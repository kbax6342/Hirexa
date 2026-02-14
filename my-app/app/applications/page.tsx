"use client";

import React, { useEffect, useMemo, useState } from "react";
import SiteNav from "../components/nav/SiteNav";
import LoginFooter from "../components/loginFooter/LoginFooter";



type TabKey = "prep" | "ready" | "progress" | "sent";

type Application = {
  id: string;
  title: string;
  company: string;
  location: string;
  logoType: "letter" | "dni";
  logoLetter?: string;
  logoBg?: string; // tailwind class like "bg-[#D94E28]"
  cta: "oneclick" | "review";
};

const MOCK_APPS: Application[] = [
  {
    id: "1",
    title: "Software Developer",
    company: "FortyAU",
    location: "Denver, CO (Remote)",
    logoType: "letter",
    logoLetter: "F",
    logoBg: "bg-[#D94E28]",
    cta: "oneclick",
  },
  {
    id: "2",
    title: "Software Developer",
    company: "FortyAU",
    location: "Dallas, TX (Remote)",
    logoType: "letter",
    logoLetter: "F",
    logoBg: "bg-[#D94E28]",
    cta: "oneclick",
  },
  {
    id: "3",
    title: "Application Developer",
    company: "Delaware Nation Industries",
    location: "Oklahoma City, OK (Remote)",
    logoType: "dni",
    cta: "review",
  },
  {
    id: "4",
    title: "Web Developer",
    company: "Rise25",
    location: "Chicago, IL (Remote)",
    logoType: "letter",
    logoLetter: "R",
    logoBg: "bg-[#0F172A]",
    cta: "review",
  },
  {
    id: "5",
    title: "Frontend Engineer",
    company: "TechFlow Inc.",
    location: "Austin, TX (Remote)",
    logoType: "letter",
    logoLetter: "T",
    logoBg: "bg-teal-600",
    cta: "oneclick",
  },
];

export default function ApplicationsPage() {
  const [tab, setTab] = useState<TabKey>("ready");
  const [page, setPage] = useState(1);
  const [showCookie, setShowCookie] = useState(false);

  // mimic your "show after 1s" cookie banner
  useEffect(() => {
    const t = setTimeout(() => setShowCookie(true), 1000);
    return () => clearTimeout(t);
  }, []);

  // For demo: only "Ready to send" shows these 5
  const apps = useMemo(() => {
    if (tab === "ready") return MOCK_APPS;
    return [];
  }, [tab]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
    

      {/* Main */}
      <main className="flex-grow w-full max-w-[1440px] mx-auto px-8 py-10 flex mt-[50] flex-col items-center">
        {/* Page header */}
        <div className="w-full max-w-5xl text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Your applications</h1>
          <p className="text-gray-500 text-base max-w-2xl mx-auto">
            Using your profile, we&apos;ve filled out the following applications. Just review,
            add any missing details, and apply.
          </p>
        </div>

        {/* Tabs */}
        <div className="w-full max-w-5xl mb-10">
          <div className="flex items-center justify-center w-full border-b border-gray-200">
            <TabButton
              active={tab === "prep"}
              onClick={() => setTab("prep")}
              label="In preparation"
            />
            <TabButton
              active={tab === "ready"}
              onClick={() => setTab("ready")}
              label={
                <>
                  Ready to send{" "}
                  <span className="ml-1 inline-flex items-center justify-center w-5 h-5 bg-[#F87171] text-white text-xs rounded-full font-bold">
                    10
                  </span>
                </>
              }
            />
            <TabButton
              active={tab === "progress"}
              onClick={() => setTab("progress")}
              label="In progress"
            />
            <TabButton active={tab === "sent"} onClick={() => setTab("sent")} label="Sent" />
          </div>
        </div>

        {/* Cards */}
        <div className="w-full max-w-5xl flex flex-col gap-5">
          {apps.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
              No applications in this tab yet.
            </div>
          ) : (
            apps.map((app) => (
              <ApplicationCard
                key={app.id}
                app={app}
                onApply={() => alert(`Apply: ${app.title} @ ${app.company}`)}
                onReview={() => alert(`Review: ${app.title} @ ${app.company}`)}
                onRemove={() => alert(`Removed: ${app.title} @ ${app.company}`)}
              />
            ))
          )}
        </div>

        {/* Pagination */}
        <div className="w-full max-w-5xl mt-8 flex justify-center">
          <nav className="flex items-center gap-2">
            <button
              type="button"
              className="p-2 text-gray-400 hover:text-gray-700 disabled:opacity-50"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <i className="fa-solid fa-chevron-left" />
            </button>

            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={[
                  "w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium",
                  page === n
                    ? "bg-blue-700 text-white"
                    : "text-gray-600 hover:bg-gray-100",
                ].join(" ")}
              >
                {n}
              </button>
            ))}

            <button
              type="button"
              className="p-2 text-gray-400 hover:text-gray-700"
              onClick={() => setPage((p) => Math.min(3, p + 1))}
              aria-label="Next page"
            >
              <i className="fa-solid fa-chevron-right" />
            </button>
          </nav>
        </div>
      </main>

      {/* Footer */}
      <LoginFooter/>
    </div>
  );
}

/* ================= SUBCOMPONENTS ================= */

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-8 py-4 font-medium text-sm transition-colors relative",
        active ? "text-gray-900 font-bold" : "text-gray-500 hover:text-gray-700",
      ].join(" ")}
    >
      {label}
      {active ? (
        <span className="absolute left-0 bottom-[-1px] w-full h-[3px] bg-[#F87171] rounded-t-[3px]" />
      ) : null}
    </button>
  );
}

function ApplicationCard({
  app,
  onApply,
  onReview,
  onRemove,
}: {
  app: Application;
  onApply: () => void;
  onReview: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
      <div className="flex items-start gap-5 w-full">
        {/* Logo */}
        {app.logoType === "dni" ? (
          <div className="w-16 h-16 rounded-md border border-gray-100 flex items-center justify-center bg-white p-2 flex-shrink-0">
            <div className="text-blue-400 font-bold text-xs text-center leading-tight">
              <i className="fa-solid fa-globe text-2xl mb-1" />
              <br />
              DNI
            </div>
          </div>
        ) : (
          <div
            className={[
              "w-16 h-16 rounded-md flex items-center justify-center text-white text-2xl font-bold flex-shrink-0",
              app.logoBg ?? "bg-gray-900",
            ].join(" ")}
          >
            {app.logoLetter ?? "H"}
          </div>
        )}

        {/* Details */}
        <div className="flex flex-col gap-1.5 flex-grow">
          <h3 className="text-lg font-bold text-gray-900 underline decoration-gray-300 decoration-1 underline-offset-4 hover:decoration-blue-600 hover:text-blue-700 cursor-pointer transition-all">
            {app.title}
          </h3>

          <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
            <i className="fa-regular fa-building" />
            <span>{app.company}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-500">
            <i className="fa-solid fa-location-dot text-gray-400" />
            <span>{app.location}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-end gap-4 min-w-[180px] w-full md:w-auto">
        {app.cta === "oneclick" ? (
          <button
            type="button"
            onClick={onApply}
            className="bg-blue-700 hover:opacity-90 text-white px-6 py-2.5 rounded-full text-sm font-semibold shadow-sm flex items-center gap-2 w-full justify-center transition-colors"
          >
            <i className="fa-solid fa-bolt text-yellow-300" />
            One-click apply
          </button>
        ) : (
          <button
            type="button"
            onClick={onReview}
            className="bg-blue-700 hover:opacity-90 text-white px-6 py-2.5 rounded-full text-sm font-semibold shadow-sm w-full justify-center transition-colors"
          >
            Review and apply
          </button>
        )}

        <div className="flex items-center gap-4 text-xs font-medium text-gray-600">
          {app.cta === "oneclick" ? (
            <button
              type="button"
              onClick={onReview}
              className="flex items-center gap-1.5 hover:text-blue-700 transition-colors"
            >
              <i className="fa-regular fa-file-lines" />
              <span className="underline decoration-gray-300 underline-offset-2">Review</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1.5 hover:text-red-600 transition-colors"
          >
            <i className="fa-regular fa-trash-can" />
            <span className="underline decoration-gray-300 underline-offset-2">Remove</span>
          </button>
        </div>
      </div>
    </div>
  );
}
