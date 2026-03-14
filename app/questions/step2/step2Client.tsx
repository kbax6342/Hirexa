"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import ResumeParsingLoadingScreen from "@/app/components/loading/ResumeParsingLoadingScreen";

declare global {
  interface Window {
    Dropbox?: {
      choose: (options: {
        success: (files: any[]) => void;
        cancel?: () => void;
        linkType?: "direct" | "preview";
        multiselect?: boolean;
        extensions?: string[];
      }) => void;
    };
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
          setOrigin: (origin: string) => unknown;
          addView: (view: unknown) => unknown;
          setCallback: (
            callback: (data: {
              action: string;
              docs?: Array<{ id: string; name: string; mimeType?: string }>;
            }) => void
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

type ResumeInputMode = "upload" | "paste";

const GOOGLE_DRIVE_DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function sanitizeGoogleConfigValue(value?: string | null) {
  if (!value) return undefined;
  const sanitized = value.trim().replace(/^['"]|['"]$/g, "");
  return sanitized || undefined;
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const alreadyLoaded = document.querySelector(`script[src="${src}"]`);
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

export default function Step2Client({ profileId, resumeId }: Step2ClientProps) {
  const router = useRouter();

  useEffect(() => {
    if (document.getElementById("dropboxjs")) return;

    const script = document.createElement("script");
    script.id = "dropboxjs";
    script.src = "https://www.dropbox.com/static/api/2/dropins.js";
    script.setAttribute("data-app-key", process.env.NEXT_PUBLIC_DROPBOX_APP_KEY!);
    script.async = true;

    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    void profileId;
    void resumeId;
  }, [profileId, resumeId]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [inputMode, setInputMode] = useState<ResumeInputMode>("upload");
  const [resumeText, setResumeText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [proof, setProof] = useState<UploadProof | null>(null);
  const [selectedSource, setSelectedSource] = useState<
    "device" | "google-drive" | "dropbox"
  >("device");
  const [isGoogleDriveLoading, setIsGoogleDriveLoading] = useState(false);

  const allowed = useMemo(
    () => [".pdf", ".doc", ".docx", ".txt", ".rtf", ".html"],
    []
  );
  const accept = useMemo(() => allowed.join(","), [allowed]);
  const canContinue =
    inputMode === "paste" ? resumeText.trim().length > 0 : Boolean(file);

  function pickFile() {
    setInputMode("upload");
    setSelectedSource("device");
    inputRef.current?.click();
  }

  async function testGoogleApiKey(apiKey: string) {
    const url = `https://www.googleapis.com/drive/v3/files?fields=files(id)&pageSize=1&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    const text = await res.text();
    console.log("KEY TEST 2 status:", res.status);
    console.log("KEY TEST 2 body:", text.slice(0, 500));
  }

  async function pickFromGoogleDrive() {
    let clientId = sanitizeGoogleConfigValue(
      process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID
    );
    let apiKey = sanitizeGoogleConfigValue(
      process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY
    );

    if (!clientId || !apiKey) {
      const configResponse = await fetch("/api/integrations/google-drive/config", {
        method: "GET",
        cache: "no-store",
      });

      if (configResponse.ok) {
        const config = (await configResponse.json()) as {
          config?: GoogleDriveConfig;
        };
        clientId = sanitizeGoogleConfigValue(config.config?.clientId);
        apiKey = sanitizeGoogleConfigValue(config.config?.apiKey);
      }
    }

    if (!clientId || !apiKey) {
      setSaveError("Google Drive import is not configured yet.");
      return;
    }

    await testGoogleApiKey(apiKey);

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

      await new Promise<void>((resolve, reject) => {
        window.gapi!.load("client:picker", {
          callback: () => resolve(),
          onerror: () => reject(new Error("Failed to load Google Picker module.")),
          timeout: 10000,
          ontimeout: () =>
            reject(new Error("Google Picker module load timed out.")),
        });
      });

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
              reject(
                new Error(response.error || "Unable to sign in to Google Drive.")
              );
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

      const selectedDoc = await new Promise<{
        id: string;
        name: string;
        mimeType?: string;
      }>((resolve, reject) => {
        const pickerAny = window.google!.picker as any;
        const docsView = new pickerAny.DocsView(pickerAny.ViewId.DOCS)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(false)
          .setMimeTypes(
            "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.google-apps.document"
          );

        const picker = new pickerAny.PickerBuilder()
          .setDeveloperKey(apiKey)
          .setOAuthToken(accessToken)
          .setOrigin(window.location.origin as any)
          .addView(docsView)
          .setCallback((data: any) => {
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

      const isGoogleDoc =
        selectedDoc.mimeType === "application/vnd.google-apps.document";
      const downloadUrl = isGoogleDoc
        ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            selectedDoc.id
          )}/export?mimeType=application/pdf`
        : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            selectedDoc.id
          )}?alt=media&supportsAllDrives=true`;

      const fileResponse = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!fileResponse.ok) {
        throw new Error(
          "Could not download the selected file from Google Drive."
        );
      }

      const blob = await fileResponse.blob();
      const pickedFile = new File([blob], selectedDoc.name, {
        type:
          isGoogleDoc
            ? "application/pdf"
            : selectedDoc.mimeType || blob.type || "application/octet-stream",
      });

      setSelectedSource("google-drive");
      handleFile(pickedFile);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Google Drive import failed.";
      const maybeInvalidApiKey = /developer key|api key|invalid/i.test(
        errorMessage
      );

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
    setInputMode("upload");
    setSelectedSource(source);
    if (source === "google-drive") {
      void pickFromGoogleDrive();
      return;
    }
    importFromDropbox();
  }

  const importFromDropbox = () => {
    if (!window.Dropbox) {
      alert("Dropbox is still loading. Please try again.");
      return;
    }

    window.Dropbox.choose({
      success: async (files: any[]) => {
        const selectedFile = files[0];
        const response = await fetch(selectedFile.link);
        const blob = await response.blob();
        const fileObj = new File([blob], selectedFile.name, { type: blob.type });
        setSelectedSource("dropbox");
        handleFile(fileObj);
      },
      cancel: () => {},
      linkType: "direct",
      multiselect: false,
      extensions: [".pdf", ".doc", ".docx"],
    });
  };

  function handleFile(nextFile: File) {
    setInputMode("upload");
    setFile(nextFile);
    setProof(null);
    setSaveError(null);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = e.target.files?.[0];
    if (nextFile) handleFile(nextFile);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const nextFile = e.dataTransfer.files?.[0];
    if (nextFile) handleFile(nextFile);
  }

  async function uploadResumeAndContinue(fileToUpload?: File) {
    const candidate: File | null | undefined = fileToUpload ?? file;

    if (!(candidate instanceof File)) {
      console.error("Resume upload failed: candidate is not a File", {
        candidate,
        type: typeof candidate,
      });
      setSaveError("Please choose a valid resume file and try again.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setProof(null);

    try {
      const fd = new FormData();
      fd.append("resume", candidate, candidate.name);

      const res = await fetch("/api/onboarding/resume", {
        method: "POST",
        body: fd,
      });

      const data = await res.json().catch(() => null);
      const nextResumeId = data?.resumeId ?? data?.resume?.id;

      if (!res.ok || !nextResumeId) {
        throw new Error(data?.error || "Upload failed");
      }

      setProof({ savedTo: data.savedTo, resume: data.resume });
      router.push(
        `/questions/step2Resume?resumeId=${encodeURIComponent(nextResumeId)}`
      );
    } catch (error) {
      console.error("Resume upload failed", error);
      setSaveError("We couldn't process your resume right now. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function savePastedResumeAndContinue() {
    const text = resumeText.trim();

    if (!text) {
      setSaveError("Paste your resume text to continue.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setProof(null);

    try {
      const fd = new FormData();
      fd.append("resumeText", text);

      const res = await fetch("/api/onboarding/resume", {
        method: "POST",
        body: fd,
      });

      const data = await res.json().catch(() => null);
      const nextResumeId = data?.resumeId ?? data?.resume?.id;

      if (!res.ok || !nextResumeId) {
        throw new Error(data?.error || "Resume paste failed");
      }

      setProof({ savedTo: data.savedTo, resume: data.resume });
      router.push(
        `/questions/step2Resume?resumeId=${encodeURIComponent(nextResumeId)}`
      );
    } catch (error) {
      console.error("Resume paste failed", error);
      setSaveError("We couldn't process your resume right now. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isSaving) {
    return <ResumeParsingLoadingScreen />;
  }

  return (
    <div className="relative mt-[50] min-h-[70vh] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900" />
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-sky-500/25 blur-3xl" />
        <div className="absolute -bottom-56 -right-56 h-[620px] w-[620px] rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30" />
      </div>

      <div className="mx-auto max-w-5xl px-6 py-14">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Add your resume
          </h1>
          <p className="text-sm text-white/70">
            Upload a file or paste your resume text. Hirexa will parse your work
            experience and send you into the existing review flow.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setInputMode("upload");
              setSaveError(null);
            }}
            className={[
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              inputMode === "upload"
                ? "bg-sky-500 text-white shadow-lg shadow-sky-500/25"
                : "border border-white/15 bg-white/5 text-white hover:bg-white/10",
            ].join(" ")}
          >
            Upload Resume File
          </button>
          <button
            type="button"
            onClick={() => {
              setInputMode("paste");
              setSaveError(null);
            }}
            className={[
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              inputMode === "paste"
                ? "bg-sky-500 text-white shadow-lg shadow-sky-500/25"
                : "border border-white/15 bg-white/5 text-white hover:bg-white/10",
            ].join(" ")}
          >
            Paste Resume Text
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          {saveError ? (
            <div className="text-sm text-red-200">
              <div className="font-semibold">Not saved</div>
              <div className="mt-1 text-white/80">{saveError}</div>
            </div>
          ) : proof ? (
            <div className="text-sm text-emerald-200">
              <div className="font-semibold">Saved</div>
              <div className="mt-1 text-xs text-white/70">
                Resume ID: <span className="font-mono">{proof.resume.id}</span> |{" "}
                Profile ID:{" "}
                <span className="font-mono">
                  {proof.savedTo?.profileId ??
                    proof.resume.profileId ??
                    proof.resume.userProfileId ??
                    "N/A"}
                </span>
              </div>
              <div className="mt-1 text-xs text-white/70">
                Source:{" "}
                <span className="font-semibold text-white">
                  {proof.resume.fileName ??
                    proof.resume.filename ??
                    "Resume input"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-white/70">
              {inputMode === "paste"
                ? "Paste your resume text, then click Continue to save it."
                : "Choose a resume file, then click Continue to save it."}
            </div>
          )}
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-[1.4fr_1fr]">
          {inputMode === "upload" ? (
            <>
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
                  <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-200">
                    Resume
                    <span className="h-1 w-1 rounded-full bg-sky-300" />
                    PDF / DOCX
                  </div>

                  <h2 className="mt-3 text-lg font-semibold text-white">
                    {file ? "File ready to upload" : "Drop your file here"}
                  </h2>
                  <p className="mt-1 text-sm text-white/70">
                    {file
                      ? "Click Continue to save it."
                      : "Or choose a file from your device."}
                  </p>

                  <div className="mt-6 rounded-xl border border-white/15 bg-black/20 p-4">
                    {file ? (
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">
                            {file.name}
                          </div>
                          <div className="mt-1 text-xs text-white/70">
                            {(file.size / 1024 / 1024).toFixed(2)} MB |{" "}
                            {selectedSource === "google-drive"
                              ? "Google Drive"
                              : selectedSource === "dropbox"
                                ? "Dropbox"
                                : "Device"}{" "}
                            | {proof ? "Saved" : "Ready"}
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

              <div className="rounded-2xl border border-white/15 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-sm">
                <div className="text-sm font-semibold text-white">
                  Import from cloud
                </div>
                <div className="mt-1 text-xs text-white/70">
                  Select your resume directly from Google Drive, or import it from Dropbox.
                </div>

                <div className="mt-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => pickFromCloud("google-drive")}
                    disabled={isGoogleDriveLoading}
                    className="inline-flex w-full items-center justify-center rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                  >
                    {isGoogleDriveLoading
                      ? "Opening Google Drive..."
                      : "Import from Google Drive"}
                  </button>

                  <button
                    type="button"
                    onClick={importFromDropbox}
                    className="inline-flex w-full items-center justify-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    Import from Dropbox
                  </button>
                </div>

                <div className="mt-6 rounded-xl bg-white/10 p-4 text-xs text-white/70">
                  Google Drive files are downloaded and saved automatically after you pick one.
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-white/15 bg-white/5 p-7 shadow-lg shadow-black/20 backdrop-blur-sm">
                <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-200">
                  Resume Text
                  <span className="h-1 w-1 rounded-full bg-sky-300" />
                  Paste
                </div>

                <h2 className="mt-3 text-lg font-semibold text-white">
                  Paste your resume content
                </h2>
                <p className="mt-1 text-sm text-white/70">
                  Copy the full text of your resume here, including job titles,
                  company names, dates, and bullet points.
                </p>

                <div className="mt-6">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                    Paste your resume here
                  </label>
                  <textarea
                    value={resumeText}
                    onChange={(e) => {
                      setResumeText(e.target.value);
                      setProof(null);
                      setSaveError(null);
                    }}
                    rows={18}
                    placeholder="Paste your full resume text here."
                    className="min-h-[26rem] w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-4 text-sm leading-7 text-white placeholder:text-white/35 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  />
                  <div className="mt-2 text-xs text-white/55">
                    {resumeText.trim().length.toLocaleString()} characters
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-sm">
                <div className="text-sm font-semibold text-white">Paste tips</div>
                <div className="mt-4 space-y-3 text-sm leading-6 text-white/70">
                  <p>Include your recent roles, companies, date ranges, and bullet points.</p>
                  <p>Plain text works best. Keep headings like Experience and Skills when possible.</p>
                  <p>You can switch back to Upload Resume File any time if you prefer PDF or DOCX.</p>
                </div>

                <div className="mt-6 rounded-xl bg-white/10 p-4 text-xs text-white/70">
                  Hirexa will save the pasted content as your resume record and continue to the same review step.
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <Link
            href="/onboarding/job-interest"
            className="text-sm font-semibold text-white/80 underline underline-offset-4 hover:text-white"
          >
            Skip for now
          </Link>

          <button
            type="button"
            onClick={() =>
              inputMode === "paste"
                ? void savePastedResumeAndContinue()
                : void uploadResumeAndContinue()
            }
            disabled={!canContinue || isSaving}
            className={[
              "rounded-full px-8 py-3 font-medium text-white transition",
              !canContinue || isSaving
                ? "cursor-not-allowed bg-white/30"
                : "bg-sky-500 hover:bg-sky-400",
            ].join(" ")}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
