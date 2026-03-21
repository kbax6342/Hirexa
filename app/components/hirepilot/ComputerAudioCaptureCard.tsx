"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ComputerDesktopIcon,
  StopIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import {
  DISPLAY_AUDIO_NO_AUDIO_ERROR,
  DISPLAY_AUDIO_PERMISSION_NOTICE,
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

export default function ComputerAudioCaptureCard({
  disabled = false,
  onBeforeConnect,
  onConnected,
  onDisconnected,
}: ComputerAudioCaptureCardProps) {
  const sessionRef = useRef<DisplayAudioCaptureSession | null>(null);
  const [status, setStatus] = useState<DisplayAudioCaptureStatus>(() =>
    isDisplayAudioCaptureSupported() ? "idle" : "unsupported"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cleanupSession = useCallback(async (notifyParent: boolean) => {
    const session = sessionRef.current;
    if (session) {
      sessionRef.current = null;
      session.stop();
    }

    if (notifyParent && session) {
      await onDisconnected?.();
    }
  }, [onDisconnected]);

  async function handleDisconnect() {
    await cleanupSession(true);
    setStatus(isDisplayAudioCaptureSupported() ? "idle" : "unsupported");
    setErrorMessage(null);
  }

  async function handleStart() {
    if (disabled || status === "requesting-permission" || status === "connected") {
      return;
    }

    const allowConnection = (await onBeforeConnect?.()) ?? true;
    if (!allowConnection) {
      return;
    }

    setStatus("requesting-permission");
    setErrorMessage(null);

    try {
      const session = await startDisplayAudioCapture();
      const handleTrackEnded = () => {
        void handleDisconnect();
      };

      session.stream.getTracks().forEach((track) => {
        track.addEventListener("ended", handleTrackEnded, { once: true });
      });

      sessionRef.current = session;
      setStatus("connected");
      await onConnected?.(session);
    } catch (error) {
      if (sessionRef.current) {
        sessionRef.current.stop();
        sessionRef.current = null;
      }

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
  }

  useEffect(() => {
    return () => {
      void cleanupSession(true);
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

      <div className="mt-4 rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-sm leading-6 text-sky-100">
        {DISPLAY_AUDIO_PERMISSION_NOTICE}
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
    </div>
  );
}
