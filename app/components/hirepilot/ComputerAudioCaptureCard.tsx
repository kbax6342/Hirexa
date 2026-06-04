"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ComputerDesktopIcon,
  StopIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import {
  DISPLAY_AUDIO_NO_AUDIO_ERROR,
  type DisplayAudioCaptureDiagnostics,
  type DisplayAudioCaptureSession,
  type DisplayAudioCaptureStatus,
  DisplayAudioCaptureError,
  isDisplayAudioCaptureSupported,
  startDisplayAudioCapture,
} from "@/app/lib/hirepilot/displayAudioCapture";
import { cn } from "@/app/lib/utils";

type ComputerAudioCaptureCardProps = {
  disabled?: boolean;
  onBeforeConnect?: () => Promise<boolean>;
  onConnected?: (session: DisplayAudioCaptureSession) => void | Promise<void>;
  onDisconnected?: () => void | Promise<void>;
};

function getStatusLabel(status: DisplayAudioCaptureStatus) {
  switch (status) {
    case "requesting-permission":
      return "Requesting permission...";
    case "connected":
      return "Connected to shared tab/app audio";
    case "no-audio-found":
      return "No audio found";
    case "permission-denied":
      return "Permission denied / cancelled";
    case "unsupported":
      return "Not supported";
    default:
      return "Idle";
  }
}

const displayAudioSetupSteps = [
  "Open HirePilot in one tab.",
  "Start or keep Google Meet in another tab.",
  "Click \"Share tab or app audio\" in HirePilot.",
  "In Chrome's picker, select the Google Meet tab and enable \"Share tab audio\".",
];

export default function ComputerAudioCaptureCard({
  disabled = false,
  onBeforeConnect,
  onConnected,
  onDisconnected,
}: ComputerAudioCaptureCardProps) {
  const sessionRef = useRef<DisplayAudioCaptureSession | null>(null);
  const isMountedRef = useRef(true);
  const onBeforeConnectRef = useRef(onBeforeConnect);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const trackEndedHandlerRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<DisplayAudioCaptureStatus>(() =>
    isDisplayAudioCaptureSupported() ? "idle" : "unsupported"
  );
  const [captureDiagnostics, setCaptureDiagnostics] =
    useState<DisplayAudioCaptureDiagnostics | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const selectedSourceLabel = captureDiagnostics?.audioTracks[0]?.label ?? null;
  const isSystemAudioSource = /system audio/i.test(selectedSourceLabel ?? "");

  useEffect(() => {
    onBeforeConnectRef.current = onBeforeConnect;
    onConnectedRef.current = onConnected;
    onDisconnectedRef.current = onDisconnected;
  }, [onBeforeConnect, onConnected, onDisconnected]);

  const cleanupSession = useCallback(
    async (options?: {
      notifyParent?: boolean;
      nextStatus?: DisplayAudioCaptureStatus;
      nextErrorMessage?: string | null;
    }) => {
      const notifyParent = Boolean(options?.notifyParent);
      const handleTrackEnded = trackEndedHandlerRef.current;
      trackEndedHandlerRef.current = null;

      const session = sessionRef.current;
      sessionRef.current = null;
      if (session && handleTrackEnded) {
        session.stream.getTracks().forEach((track) => {
          track.removeEventListener("ended", handleTrackEnded);
        });
      }

      if (session) {
        session.stop();
      }

      if (isMountedRef.current) {
        setStatus(options?.nextStatus ?? (isDisplayAudioCaptureSupported() ? "idle" : "unsupported"));
        setCaptureDiagnostics(null);
        setErrorMessage(options?.nextErrorMessage ?? null);
      }

      if (notifyParent && session) {
        await onDisconnectedRef.current?.();
      }
    },
    []
  );

  const handleDisconnect = useCallback(async () => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[hirepilot] stop listening clicked", {
        source: "shared-audio",
      });
    }

    await cleanupSession({ notifyParent: true });
  }, [cleanupSession]);

  const handleStart = useCallback(async () => {
    if (disabled || status === "requesting-permission" || status === "connected") {
      return;
    }

    const allowConnection = (await onBeforeConnectRef.current?.()) ?? true;
    if (!allowConnection) {
      return;
    }

    setStatus("requesting-permission");
    setErrorMessage(null);

    try {
      const session = await startDisplayAudioCapture();
      const handleTrackEnded = () => {
        void cleanupSession({ notifyParent: true });
      };

      trackEndedHandlerRef.current = handleTrackEnded;
      session.stream.getTracks().forEach((track) => {
        track.addEventListener("ended", handleTrackEnded, { once: true });
      });

      sessionRef.current = session;
      setCaptureDiagnostics(session.diagnostics);
      setStatus("connected");
      await onConnectedRef.current?.(session);
    } catch (error) {
      await cleanupSession({ notifyParent: false });

      if (error instanceof DisplayAudioCaptureError) {
        setStatus(
          error.code === "no-audio-found"
            ? "no-audio-found"
            : error.code === "permission-denied"
              ? "permission-denied"
              : error.code === "unsupported"
                ? "unsupported"
                : "idle"
        );
        setErrorMessage(
          error.code === "no-audio-found" ? DISPLAY_AUDIO_NO_AUDIO_ERROR : error.message
        );
        return;
      }

      setStatus("idle");
      setErrorMessage("Unable to start shared tab or app audio capture.");
    }
  }, [cleanupSession, disabled, status]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      void cleanupSession({ notifyParent: false });
    };
  }, [cleanupSession]);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-200">
          <ComputerDesktopIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 space-y-2">
          <div className="text-sm font-semibold text-white">
            Listen to interview audio from this computer
          </div>
          <p className="text-sm leading-6 text-slate-300">
            HirePilot can listen to questions played in a browser tab or app on this
            device, like Google Meet or Microsoft Teams, instead of relying only on your
            microphone.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
        <ol className="space-y-2 leading-6">
          {displayAudioSetupSteps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="font-semibold text-sky-50">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => void handleStart()}
          disabled={disabled || status === "requesting-permission" || status === "connected"}
          className="rounded-xl bg-sky-600 px-5 py-3 text-white hover:bg-sky-500"
        >
          <ComputerDesktopIcon className="h-5 w-5" />
          {status === "requesting-permission" ? "Connecting..." : "Share tab or app audio"}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => void handleDisconnect()}
          disabled={status !== "connected"}
          className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
        >
          <StopIcon className="h-5 w-5" />
          Disconnect
        </Button>

        <div
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
            status === "connected"
              ? "bg-emerald-500/15 text-emerald-200"
              : status === "requesting-permission"
                ? "bg-sky-500/10 text-sky-100"
                : status === "no-audio-found" || status === "permission-denied"
                  ? "bg-amber-500/10 text-amber-100"
                  : status === "unsupported"
                    ? "bg-red-500/10 text-red-100"
                    : "bg-white/10 text-slate-300"
          )}
        >
          {getStatusLabel(status)}
        </div>
      </div>

      {errorMessage ? (
        <div
          className={cn(
            "mt-4 rounded-2xl px-4 py-3 text-sm",
            status === "unsupported"
              ? "border border-red-300/20 bg-red-500/10 text-red-100"
              : "border border-amber-300/20 bg-amber-500/10 text-amber-100"
          )}
        >
          {errorMessage}
        </div>
      ) : null}

      {status === "connected" ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Connection confirms the browser shared an audio track, but HirePilot still
            needs audible speech from the correct tab or app to transcribe anything.
            If the transcript stays empty, reconnect and choose the Meet or Teams tab,
            not the HirePilot tab.
          </div>

          {isSystemAudioSource ? (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Chrome tab audio is usually more reliable than generic System Audio for
              interview transcription. Reconnect and choose the actual Meet, Teams, or
              interview tab with Share tab audio enabled when possible.
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs leading-6 text-slate-300">
            <div>Audio tracks detected: {captureDiagnostics?.audioTrackCount ?? 0}</div>
            <div>
              Shared audio source: {selectedSourceLabel ?? "Shared tab/app audio"}
            </div>
            <div>
              Track enabled: {captureDiagnostics?.audioTracks[0]?.enabled ? "Yes" : "No"}{" "}
              • muted: {captureDiagnostics?.audioTracks[0]?.muted ? "Yes" : "No"}
            </div>
            <div>
              Track ready state:{" "}
              {captureDiagnostics?.audioTracks[0]?.readyState ?? "unknown"}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
