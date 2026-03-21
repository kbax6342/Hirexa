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

export const DISPLAY_AUDIO_PERMISSION_NOTICE =
  "Chrome needs permission to record your screen or app audio. When prompted, choose the tab or application playing the interview questions and allow screen/audio capture so HirePilot can listen correctly.";

export const DISPLAY_AUDIO_NO_AUDIO_ERROR =
  "No shared tab or app audio was detected. Please share the browser tab or application where the interview questions are playing and make sure audio is included.";

export class DisplayAudioCaptureError extends Error {
  code: DisplayAudioCaptureErrorCode;

  constructor(code: DisplayAudioCaptureErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type DisplayAudioCaptureSession = {
  stream: MediaStream;
  audioStream: MediaStream;
  stop: () => void;
};

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

    const audioStream = new MediaStream(audioTracks);

    return {
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
