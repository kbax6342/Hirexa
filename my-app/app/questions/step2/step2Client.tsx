// /app/questions/step2/step2Client.tsx
"use client";

import Link from "next/link";
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    gapi?: {
      load: (
        name: string,
        callbackOrConfig:
          | (() => void)
          | {
              callback?: () => void;
              onerror?: () => void;
              timeout?: number;
              ontimeout?: () => void;
            }
      ) => void;
      client: {
        init: (args: { apiKey: string; discoveryDocs: string[] }) => Promise<void>;
      };
    };
    google?: {
      picker?: {
        Action: { PICKED: string; CANCEL: string };
        DocsView: new () => {
          setIncludeFolders: (include: boolean) => unknown;
          setSelectFolderEnabled: (enabled: boolean) => unknown;
        };
        PickerBuilder: new () => {
          setDeveloperKey: (key: string) => unknown;
          setOAuthToken: (token: string) => unknown;
          addView: (view: unknown) => unknown;
          setCallback: (
            callback: (data: { action: string; docs?: Array<{ id: string; name: string; mimeType?: string }> }) => void
          ) => unknown;
          build: () => { setVisible: (visible: boolean) => void };
        };
      };
      accounts?: {
        oauth2?: {
          initTokenClient: (args: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: (args: { prompt: string }) => void };
        };
      };
    };
  }
}

type Step2ClientProps = {
  profileId: string | null;
  resumeId: string | null;
};

type UploadProof = {
  savedTo?: {
    sessionUserId?: string | null;
    guestId?: string | null;
    profileId?: string | null;
  };
  resume: {
    id: string;
    profileId?: string | null;
    userProfileId?: string | null;
    fileName?: string;
    filename?: string;
    mimeType: string;
    sizeBytes?: number;
    createdAt?: string;
  };
};

type GoogleDriveConfig = {
  clientId: string;
  apiKey: string;
};

const GOOGLE_DRIVE_DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function sanitizeGoogleConfigValue(value?: string | null) {
  if (!value) return undefined;
  const sanitized = value.trim().replace(/^['\"]|['\"]$/g, "");
  return sanitized || undefined;
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const alreadyLoaded = document.querySelector(`script[src=\"${src}\"]`);
    if (alreadyLoaded) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.body.appendChild(script);
  });
}

export default function Step2Client({
  profileId,
  resumeId,
}: Step2ClientProps) {
  const router = useRouter();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [proof, setProof] = useState<UploadProof | null>(null);
  const [selectedSource, setSelectedSource] = useState<"device" | "google-drive" | "dropbox">("device");
  const [isGoogleDriveLoading, setIsGoogleDriveLoading] = useState(false);

  useEffect(() => {
    console.log("✅ Step2Client mounted", { profileId, resumeId });
  }, [profileId, resumeId]);

  const allowed = useMemo(() => [".pdf", ".doc", ".docx", ".txt", ".rtf", ".html"], []);
  const accept = useMemo(() => allowed.join(","), [allowed]);

  function pickFile() {
    setSelectedSource("device");
    inputRef.current?.click();
  }

  async function pickFromGoogleDrive() {
    let clientId = sanitizeGoogleConfigValue(process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID);
    let apiKey = sanitizeGoogleConfigValue(process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY);

    if (!clientId || !apiKey) {
      const configResponse = await fetch("/api/integrations/google-drive/config", {
        method: "GET",
        cache: "no-store",
      });

      if (configResponse.ok) {
        const config = (await configResponse.json()) as { config?: GoogleDriveConfig };
        clientId = sanitizeGoogleConfigValue(config.config?.clientId);
        apiKey = sanitizeGoogleConfigValue(config.config?.apiKey);
      }
    }

    if (!clientId || !apiKey) {
      setSaveError("Google Drive import is not configured yet. Missing client ID or API key.");
      return;
    }

    setIsGoogleDriveLoading(true);
    setSaveError(null);

    try {
      await Promise.all([
        loadScript("https://apis.google.com/js/api.js"),
        loadScript("https://accounts.google.com/gsi/client"),
      ]);

      if (!window.gapi?.load) {
        throw new Error("Google Drive tools are unavailable right now.");
      }

     // Load the modules first
    await new Promise<void>((resolve, reject) => {
      window.gapi!.load("client:picker", {
        callback: () => resolve(),
        onerror: () => reject(new Error("Failed to load Google Picker module.")),
        timeout: 10000,
        ontimeout: () => reject(new Error("Google Picker module load timed out.")),
      });
    });

    // NOW check google identity + picker objects
    if (!window.google?.accounts?.oauth2) {
      throw new Error("Google Identity Services failed to load.");
    }

    if (!window.google?.picker) {
      throw new Error("Google Picker failed to initialize.");
    }

      await window.gapi.client.init({
        apiKey,
        discoveryDocs: [GOOGLE_DRIVE_DISCOVERY_DOC],
      });

      const accessToken = await new Promise<string>((resolve, reject) => {
        const tokenClient = window.google?.accounts?.oauth2?.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_DRIVE_SCOPE,
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(new Error(response.error || "Unable to sign in to Google Drive."));
              return;
            }

            resolve(response.access_token);
          },
        });

        if (!tokenClient) {
          reject(new Error("Unable to initialize Google sign-in."));
          return;
        }

        tokenClient.requestAccessToken({ prompt: "consent" });
      });

      const selectedDoc = await new Promise<{ id: string; name: string; mimeType?: string }>((resolve, reject) => {
        const docsView = new window.google!.picker!.DocsView()
          .setIncludeFolders(true)
          .setSelectFolderEnabled(false);

        const picker = new window.google!.picker!.PickerBuilder()
          .setDeveloperKey(apiKey)
          .setOAuthToken(accessToken)
          .addView(docsView)
          .setCallback((data) => {
            if (data.action === window.google?.picker?.Action.CANCEL) {
              reject(new Error("Google Drive selection was canceled."));
              return;
            }

            if (data.action !== window.google?.picker?.Action.PICKED) return;

            const pickedFile = data.docs?.[0];
            if (!pickedFile) {
              reject(new Error("No file was selected."));
              return;
            }

            resolve(pickedFile);
          })
          .build();

        picker.setVisible(true);
      });

      const fileResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(selectedDoc.id)}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!fileResponse.ok) {
        throw new Error("Could not download the selected file from Google Drive.");
      }

      const blob = await fileResponse.blob();
      const pickedFile = new File([blob], selectedDoc.name, {
        type: selectedDoc.mimeType || blob.type || "application/octet-stream",
      });

      setSelectedSource("google-drive");
      handleFile(pickedFile);
      await uploadResumeAndContinue(pickedFile);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Google Drive import failed.";
      const maybeInvalidApiKey = /developer key|api key|invalid/i.test(errorMessage);

      setSaveError(
        maybeInvalidApiKey
          ? "Google Drive API key is invalid. Use a Browser key with Google Picker API and Drive API enabled."
          : errorMessage
      );
    } finally {
      setIsGoogleDriveLoading(false);
    }
  }

  function pickFromCloud(source: "google-drive" | "dropbox") {
    setSelectedSource(source);
    if (source === "google-drive") {
      void pickFromGoogleDrive();
      return;
    }

    const cloudUrl =
      "https://www.dropbox.com/home";

    window.open(cloudUrl, "_blank", "noopener,noreferrer");
  }

  function handleFile(f: File) {
    setFile(f);
    setProof(null);
    setSaveError(null);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  async function uploadResumeAndContinue(fileToUpload?: File) {
    const targetFile = fileToUpload ?? file;

    if (!targetFile) {
      setSaveError("Please choose a resume file first.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setProof(null);

    try {
      const fd = new FormData();
      fd.append("resume", targetFile);

      const res = await fetch("/api/onboarding/resume", {
        method: "POST",
        body: fd,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.resume?.id) {
        throw new Error(data?.error || "Upload failed");
      }

      setProof({ savedTo: data.savedTo, resume: data.resume });

      router.push(
        `/questions/step2Resume?resumeId=${encodeURIComponent(data.resume.id)}`
      );
    } catch (e: unknown) {
      const errorMessage =
        e instanceof Error
          ? e.message
          : "Something went wrong while saving your resume.";
      setSaveError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="relative min-h-[70vh] overflow-hidden mt-[50]">
      {/* ===== Background: copy/paste Hirexa-style hero ===== */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900" />

        {/* Soft glow blobs */}
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-sky-500/25 blur-3xl" />
        <div className="absolute -bottom-56 -right-56 h-[620px] w-[620px] rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />

        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />

        {/* Top/bottom fade */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30" />
      </div>
      {/* ===== End background ===== */}

      <div className="mx-auto max-w-5xl px-6 py-14">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Upload your resume
          </h1>
          <p className="text-sm text-white/70">
            Drag & drop a file or import it from your cloud storage. We’ll extract
            your work experience automatically.
          </p>
        </div>

        {/* Status */}
        <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          {isSaving ? (
            <div className="text-sm text-white">Saving resume…</div>
          ) : saveError ? (
            <div className="text-sm text-red-200">
              <div className="font-semibold">Not saved</div>
              <div className="mt-1 text-white/80">{saveError}</div>
            </div>
          ) : proof ? (
            <div className="text-sm text-emerald-200">
              <div className="font-semibold">Saved ✅</div>
              <div className="mt-1 text-xs text-white/70">
                Resume ID: <span className="font-mono">{proof.resume.id}</span> •
                Profile ID:{" "}
                <span className="font-mono">
                  {proof.savedTo?.profileId ??
                    proof.resume.profileId ??
                    proof.resume.userProfileId ??
                    "N/A"}
                </span>
              </div>
              <div className="mt-1 text-xs text-white/70">
                File:{" "}
                <span className="font-semibold text-white">
                  {proof.resume.fileName ??
                    proof.resume.filename ??
                    "Uploaded resume"}
                </span>{" "}
                {typeof proof.resume.sizeBytes === "number" ? (
                  <>• {(proof.resume.sizeBytes / 1024 / 1024).toFixed(2)} MB</>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="text-sm text-white/70">
              Choose a file, then click Next to save it.
            </div>
          )}
        </div>

        {/* Main grid */}
        <div className="mt-10 grid gap-6 md:grid-cols-[1.4fr_1fr]">
          {/* Dropzone */}
          <div
            className={[
              "relative overflow-hidden rounded-2xl border bg-white/5 shadow-lg shadow-black/20 backdrop-blur-sm",
              dragOver ? "border-sky-400 ring-4 ring-sky-400/20" : "border-white/15",
            ].join(" ")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <div className="p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-200">
                    Resume
                    <span className="h-1 w-1 rounded-full bg-sky-300" />
                    PDF / DOCX
                  </div>

                  <h2 className="mt-3 text-lg font-semibold text-white">
                    {file ? "File ready to upload" : "Drop your file here"}
                  </h2>
                  <p className="mt-1 text-sm text-white/70">
                    {file ? "Click Next to save it." : "Or choose a file from your device."}
                  </p>
                </div>
              </div>

              {/* File row */}
              <div className="mt-6 rounded-xl border border-white/15 bg-black/20 p-4">
                {file ? (
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">
                        {file.name}
                      </div>
                      <div className="mt-1 text-xs text-white/70">
                        {(file.size / 1024 / 1024).toFixed(2)} MB •{" "}
                        {selectedSource === "google-drive"
                          ? "Google Drive"
                          : selectedSource === "dropbox"
                          ? "Dropbox"
                          : "Device"}{" "}
                        •{" "}
                        {isSaving
                          ? "Saving…"
                          : proof
                          ? "Saved"
                          : saveError
                          ? "Not saved"
                          : "Ready"}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setSelectedSource("device");
                        setProof(null);
                        setSaveError(null);
                        if (inputRef.current) inputRef.current.value = "";
                      }}
                      className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={pickFile}
                    className="inline-flex w-full items-center justify-center rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
                  >
                    Choose file
                  </button>
                )}
              </div>

              <input
                ref={inputRef}
                type="file"
                accept={accept}
                onChange={onInputChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Cloud imports */}
          <div className="rounded-2xl border border-white/15 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-sm">
            <div className="text-sm font-semibold text-foreground">
              Import from cloud
            </div>
            <div className="mt-1 text-xs text-gray-600">
              Select your resume directly from Google Drive, or open Dropbox in a new tab.
            </div>

            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => pickFromCloud("google-drive")}
                disabled={isGoogleDriveLoading}
                className="inline-flex w-full items-center justify-center rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                {isGoogleDriveLoading ? "Opening Google Drive..." : "Import from Google Drive"}
              </button>

              <button
                type="button"
                onClick={() => pickFromCloud("dropbox")}
                className="inline-flex w-full items-center justify-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Import from Dropbox
              </button>
            </div>

            <div className="mt-6 rounded-xl bg-gray-50 p-4 text-xs text-gray-600">
              Google Drive files are downloaded and saved automatically after you pick one.
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-8 flex items-center justify-between">
          <Link
            href="/onboarding/job-interest"
            className="text-sm font-semibold text-white/80 underline underline-offset-4 hover:text-white"
          >
            Skip for now
          </Link>

          <button
            type="button"
            onClick={uploadResumeAndContinue}
            disabled={!file || isSaving}
            className={[
              "rounded-full px-8 py-3 font-medium text-white transition",
              !file || isSaving ? "cursor-not-allowed bg-white/30" : "bg-sky-500 hover:bg-sky-400",
            ].join(" ")}
          >
            {isSaving ? "Saving..." : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
