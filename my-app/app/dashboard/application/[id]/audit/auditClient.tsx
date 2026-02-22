"use client";

import { useCallback, useEffect, useState } from "react";

type EmbedResponse = {
  ok: boolean;
  jobTitle?: string;
  jobUrl?: string;
  company?: string;
  location?: string | null;
  embedUrl?: string;
  warning?: string;
  error?: string;
};

export default function AuditClient({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [data, setData] = useState<EmbedResponse | null>(null);

  const loadEmbed = useCallback(async () => {
    const response = await fetch(`/api/applications/${applicationId}/embed`, { cache: "no-store" });
    const payload = (await response.json()) as EmbedResponse;

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? "Unable to load application embed");
    }

    setData(payload);
  }, [applicationId]);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadEmbed();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load application form");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadEmbed]);

  if (loading) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
        <div className="mt-3 h-5 w-80 animate-pulse rounded bg-gray-100" />
        <div className="mt-6 h-[80vh] min-h-[900px] animate-pulse rounded-lg border border-gray-200 bg-gray-100" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <h1 className="text-lg font-semibold">Application Audit</h1>
        <p className="mt-2">{error}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-900">Application Audit</h1>
      <p className="mt-1 text-lg font-medium text-gray-800">{data?.jobTitle ?? "Untitled role"}</p>

      {data?.company || data?.location ? (
        <p className="mt-1 text-sm text-gray-600">
          {[data?.company, data?.location].filter(Boolean).join(" • ")}
        </p>
      ) : null}

      {data?.warning ? <p className="mt-3 text-xs text-amber-700">{data.warning}</p> : null}

      {data?.embedUrl ? (
        <>
          <div className="mt-4">
            <a
              href={data.embedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              Open in new tab
            </a>
          </div>

          {iframeError ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              The embedded form could not be displayed here. Please use the Open in new tab link.
            </div>
          ) : null}

          <iframe
            key={data.embedUrl}
            src={data.embedUrl}
            title={data.jobTitle ? `${data.jobTitle} application form` : "Embedded application form"}
            className="mt-4 min-h-[900px] h-[80vh] w-full rounded-lg border border-gray-200"
            onError={() => setIframeError(true)}
          />
        </>
      ) : (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This application does not have a job URL yet. Please add a job URL to preview the form.
        </p>
      )}
    </section>
  );
}
