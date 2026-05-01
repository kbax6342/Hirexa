export type DisplayAudioCaptureStatus =
  | "idle"
  | "requesting-permission"
  | "connected"
  | "no-audio-found"
  | "permission-denied"
  | "unsupported";

export type DisplayAudioCaptureErrorCode =
  | "unsupported"
  | "permission-denied"
  | "no-audio-found"
  | "start-failed";

export const DISPLAY_AUDIO_NO_AUDIO_ERROR =
  "No shared audio was detected. In Chrome, choose the Google Meet browser tab and turn on \"Share tab audio\". Sharing the HirePilot tab will not capture the Meet conversation.";

export type DisplayAudioTrackDiagnostics = {
  enabled: boolean;
  label: string | null;
  muted: boolean;
  readyState: MediaStreamTrackState;
};

export type DisplayAudioCaptureDiagnostics = {
  audioTrackCount: number;
  audioTracks: DisplayAudioTrackDiagnostics[];
};

export class DisplayAudioCaptureError extends Error {
  code: DisplayAudioCaptureErrorCode;

  constructor(code: DisplayAudioCaptureErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type DisplayAudioCaptureSession = {
  diagnostics: DisplayAudioCaptureDiagnostics;
  stream: MediaStream;
  audioStream: MediaStream;
  stop: () => void;
};

function debugDisplayAudioCapture(
  message: string,
  diagnostics?: DisplayAudioCaptureDiagnostics
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (diagnostics) {
    console.info("[HIREPILOT_AUDIO]", message, diagnostics);
    return;
  }

  console.info("[HIREPILOT_AUDIO]", message);
}

export function isDisplayAudioCaptureSupported() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function"
  );
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function getSupportedDisplayAudioMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "video/webm;codecs=opus",
    "video/webm",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function isPermissionDeniedError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" ||
      error.name === "AbortError")
  );
}

export async function startDisplayAudioCapture(): Promise<DisplayAudioCaptureSession> {
  if (!isDisplayAudioCaptureSupported()) {
    throw new DisplayAudioCaptureError(
      "unsupported",
      "This browser does not support shared tab or app audio capture yet. Try the latest version of Chrome."
    );
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stopMediaStream(stream);
      throw new DisplayAudioCaptureError("no-audio-found", DISPLAY_AUDIO_NO_AUDIO_ERROR);
    }

    const diagnostics: DisplayAudioCaptureDiagnostics = {
      audioTrackCount: audioTracks.length,
      audioTracks: audioTracks.map((track) => ({
        enabled: track.enabled,
        label: track.label?.trim() || null,
        muted: track.muted,
        readyState: track.readyState,
      })),
    };

    debugDisplayAudioCapture("shared audio capture started", diagnostics);

    const audioStream = new MediaStream(audioTracks);

    return {
      diagnostics,
      stream,
      audioStream,
      stop: () => stopMediaStream(stream),
    };
  } catch (error) {
    if (error instanceof DisplayAudioCaptureError) {
      throw error;
    }

    if (isPermissionDeniedError(error)) {
      throw new DisplayAudioCaptureError(
        "permission-denied",
        "Screen or app audio permission was denied or cancelled."
      );
    }

    throw new DisplayAudioCaptureError(
      "start-failed",
      "Unable to start shared tab or app audio capture."
    );
  }
}
