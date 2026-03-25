"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  ComputerDesktopIcon,
  LightBulbIcon,
  MicrophoneIcon,
  PlayCircleIcon,
  SparklesIcon,
  StopIcon,
} from "@heroicons/react/24/outline";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import ComputerAudioCaptureCard from "@/app/components/hirepilot/ComputerAudioCaptureCard";
import HirePilotPaywall from "@/app/components/hirepilot/HirePilotPaywall";
import { Textarea } from "@/app/components/ui/textarea";
import {
  getSupportedDisplayAudioMimeType,
  type DisplayAudioCaptureSession,
} from "@/app/lib/hirepilot/displayAudioCapture";
import {
  extractInterviewQuestion,
  extractInterviewQuestionCandidate,
} from "@/app/lib/hirepilot/extractInterviewQuestion";
import type {
  HirePilotDetectedQuestion,
  HirePilotInterviewReport,
  HirePilotSessionInputSource,
  HirePilotSessionStatus,
  HirePilotSuggestedAnswer,
} from "@/app/lib/hirepilot/interviewReport";
import { cn } from "@/app/lib/utils";

type RewriteMode = "default" | "shorten" | "expand" | "professional";
type PracticeMode = "live" | "practice";
type DetectionStatus = "idle" | "found" | "none";
type ListeningSource = "microphone" | "computer";

type HirePilotResponse = {
  ok: boolean;
  answer?: string;
  tips?: string[];
  error?: string;
  source?: "openai" | "fallback";
  hirePilotUnlimited?: boolean;
  hirePilotCredits?: number;
};

type HirePilotStatusResponse = {
  hasHirePilotAccess?: boolean;
  hirePilotUnlimited: boolean;
  hirePilotCredits: number;
  monthlyCredits?: number;
  rolloverCredits?: number;
  purchasedCredits?: number;
  productKey?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
  nextMonthlyResetAt?: string | null;
  earliestPurchasedExpiryAt?: string | null;
  lowBalance?: boolean;
  hasExpiringCredits?: boolean;
};

type StartInterviewResponse = {
  ok?: boolean;
  started?: boolean;
  message?: string;
  hasHirePilotAccess?: boolean;
  hirePilotUnlimited?: boolean;
  hirePilotCredits?: number;
  monthlyCredits?: number;
  rolloverCredits?: number;
  purchasedCredits?: number;
  productKey?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
  nextMonthlyResetAt?: string | null;
  earliestPurchasedExpiryAt?: string | null;
  lowBalance?: boolean;
  hasExpiringCredits?: boolean;
};

type HirePilotTranscriptionResponse = {
  ok?: boolean;
  transcript?: string;
  error?: string;
  hasHirePilotAccess?: boolean;
  hirePilotUnlimited?: boolean;
  hirePilotCredits?: number;
  monthlyCredits?: number;
  rolloverCredits?: number;
  purchasedCredits?: number;
  productKey?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
  nextMonthlyResetAt?: string | null;
  earliestPurchasedExpiryAt?: string | null;
  lowBalance?: boolean;
  hasExpiringCredits?: boolean;
};

type HirePilotSessionResponse = {
  ok?: boolean;
  error?: string;
  reportAvailable?: boolean;
  session?: {
    id?: string;
    status?: HirePilotSessionStatus | null;
    inputSource?: HirePilotSessionInputSource | null;
    reportEligible?: boolean;
    report?: HirePilotInterviewReport | null;
    createdAt?: string | null;
    endedAt?: string | null;
  } | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

const defaultTips = [
  "Structure answers using the STAR method for behavioral questions.",
  "Keep answers grounded in specific work examples instead of broad claims.",
  "End by connecting your story back to the role you want next.",
];

const practiceQuestions = [
  "Tell me about yourself.",
  "Why are you interested in this role?",
  "What is one of your biggest strengths?",
  "Describe a time you handled a difficult challenge at work.",
  "Tell me about a project you are proud of.",
  "Why should we hire you?",
];

const compatibilityPlatforms = [
  { name: "Zoom", accentClassName: "bg-sky-400" },
  { name: "Google Meet", accentClassName: "bg-emerald-400" },
  { name: "Microsoft Teams", accentClassName: "bg-violet-400" },
  { name: "HackerRank", accentClassName: "bg-lime-400" },
];

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeQuestionKey(value: string) {
  return normalizeSpace(value).toLowerCase().replace(/[?!.,]+$/g, "");
}

function debugHirePilot(message: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (data) {
    console.log(`[hirepilot] ${message}`, data);
    return;
  }

  console.log(`[hirepilot] ${message}`);
}

function formatRecognitionError(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Microphone permission was denied.";
  }
  if (error === "no-speech") {
    return "No speech was detected. Try again when the interviewer asks a question.";
  }
  if (error === "audio-capture") {
    return "No microphone was found for speech recognition.";
  }
  return "Speech recognition stopped unexpectedly.";
}

async function readJsonSafely<T>(res: Response, fallback: T) {
  try {
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

function toBillingStatus(data?: HirePilotStatusResponse | StartInterviewResponse | null) {
  const hirePilotUnlimited = Boolean(data?.hirePilotUnlimited);
  const hirePilotCredits = Number(data?.hirePilotCredits ?? 0);

  return {
    hasHirePilotAccess:
      Boolean(data?.hasHirePilotAccess) || hirePilotUnlimited || hirePilotCredits > 0,
    hirePilotUnlimited,
    hirePilotCredits,
    monthlyCredits: Number(data?.monthlyCredits ?? 0),
    rolloverCredits: Number(data?.rolloverCredits ?? 0),
    purchasedCredits: Number(data?.purchasedCredits ?? 0),
    productKey: data?.productKey ?? null,
    status: data?.status ?? null,
    currentPeriodEnd: data?.currentPeriodEnd ?? null,
    nextMonthlyResetAt: data?.nextMonthlyResetAt ?? null,
    earliestPurchasedExpiryAt: data?.earliestPurchasedExpiryAt ?? null,
    lowBalance: Boolean(data?.lowBalance),
    hasExpiringCredits: Boolean(data?.hasExpiringCredits),
  };
}

export default function HirePilotClient() {
  const searchParams = useSearchParams();
  const checkoutState = searchParams.get("checkout");
  const checkoutSessionId = searchParams.get("session_id");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const keepListeningRef = useRef(false);
  const transcriptRef = useRef("");
  const combinedTranscriptRef = useRef("");
  const stopHandledRef = useRef(false);
  const lastQuestionKeyRef = useRef("");
  const sessionInputSourceRef = useRef<HirePilotSessionInputSource | null>(null);
  const reportEligibleRef = useRef(false);
  const completingSessionRef = useRef(false);
  const detectedQuestionsRef = useRef<HirePilotDetectedQuestion[]>([]);
  const suggestedAnswersRef = useRef<HirePilotSuggestedAnswer[]>([]);
  const displayRecorderRef = useRef<MediaRecorder | null>(null);
  const displayRecorderStoppedPromiseRef = useRef<Promise<void> | null>(null);
  const displayRecorderStoppedResolveRef = useRef<(() => void) | null>(null);
  const transcriptionQueueRef = useRef<Promise<void>>(Promise.resolve());

  const [activeMode, setActiveMode] = useState<PracticeMode>("live");
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [activeListeningSource, setActiveListeningSource] = useState<ListeningSource | null>(
    null
  );
  const [statusMessage, setStatusMessage] = useState("Microphone idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [detectedQuestion, setDetectedQuestion] = useState("");
  const [detectionStatus, setDetectionStatus] = useState<DetectionStatus>("idle");
  const [answer, setAnswer] = useState("");
  const [tips, setTips] = useState<string[]>(defaultTips);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeRewrite, setActiveRewrite] = useState<Exclude<RewriteMode, "default"> | null>(null);
  const [copied, setCopied] = useState(false);
  const [responseSource, setResponseSource] = useState<"openai" | "fallback" | null>(null);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [autoGeneratePractice, setAutoGeneratePractice] = useState(true);
  const [billingStatus, setBillingStatus] = useState<HirePilotStatusResponse>({
    hasHirePilotAccess: false,
    hirePilotUnlimited: false,
    hirePilotCredits: 0,
    monthlyCredits: 0,
    rolloverCredits: 0,
    purchasedCredits: 0,
    productKey: null,
    status: null,
    currentPeriodEnd: null,
    nextMonthlyResetAt: null,
    earliestPurchasedExpiryAt: null,
    lowBalance: false,
    hasExpiringCredits: false,
  });
  const [billingLoading, setBillingLoading] = useState(true);
  const [startingInterview, setStartingInterview] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [interviewSessionStarted, setInterviewSessionStarted] = useState(false);
  const [isInfoPanelCollapsed, setIsInfoPanelCollapsed] = useState(false);
  const [interviewReport, setInterviewReport] = useState<HirePilotInterviewReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [completedSessionSource, setCompletedSessionSource] =
    useState<HirePilotSessionInputSource | null>(null);

  const practiceQuestion = practiceQuestions[practiceIndex] ?? practiceQuestions[0];
  const isComputerAudioListening = activeListeningSource === "computer";
  const isAnyListening = isListening || isComputerAudioListening;

  const answerActionsDisabled = !answer.trim() || isGenerating;
  const detectedQuestionText =
    detectionStatus === "idle"
      ? "Waiting for a question."
      : detectionStatus === "none"
        ? "No question detected."
        : detectedQuestion;
  const hasPaidHirePilotAccess =
    interviewSessionStarted ||
    Boolean(billingStatus.hasHirePilotAccess);
  const accessBadgeLabel = billingLoading
    ? "Checking access..."
    : billingStatus.hirePilotUnlimited
    ? "Unlimited Access"
    : billingStatus.hirePilotCredits > 0
    ? `Credits Remaining: ${billingStatus.hirePilotCredits}`
    : billingStatus.productKey === "hirepilot_monthly" && billingStatus.status === "active"
    ? "0 Credits Available"
    : "Practice Questions Free";
  const liveListeningLabel = isComputerAudioListening
    ? "Listening to shared tab/app audio"
    : isListening
      ? "Listening to microphone"
      : accessBadgeLabel;
  const monthlyCreditBucket =
    Number(billingStatus.monthlyCredits ?? 0) + Number(billingStatus.rolloverCredits ?? 0);

  function resetInterviewReportState() {
    sessionInputSourceRef.current = null;
    reportEligibleRef.current = false;
    detectedQuestionsRef.current = [];
    suggestedAnswersRef.current = [];
    completingSessionRef.current = false;
    setInterviewReport(null);
    setCompletedSessionSource(null);
    setReportLoading(false);
  }

  function rememberDetectedQuestion(question: string) {
    const normalizedQuestion = normalizeSpace(question);
    if (!normalizedQuestion) return;

    const key = normalizeQuestionKey(normalizedQuestion);
    if (!key) return;

    const existing = detectedQuestionsRef.current.find(
      (item) => normalizeQuestionKey(item.question) === key
    );

    if (existing) {
      return;
    }

    detectedQuestionsRef.current = [
      ...detectedQuestionsRef.current,
      { question: normalizedQuestion },
    ];
  }

  function rememberSuggestedAnswer(
    question: string,
    answerText: string,
    source: "openai" | "fallback" | null
  ) {
    const normalizedQuestion = normalizeSpace(question);
    const normalizedAnswer = normalizeSpace(answerText);
    if (!normalizedQuestion || !normalizedAnswer) return;

    const key = normalizeQuestionKey(normalizedQuestion);
    const nextEntry: HirePilotSuggestedAnswer = {
      question: normalizedQuestion,
      answer: normalizedAnswer,
      source,
    };

    const existingIndex = suggestedAnswersRef.current.findIndex(
      (item) => normalizeQuestionKey(item.question) === key
    );

    if (existingIndex === -1) {
      suggestedAnswersRef.current = [...suggestedAnswersRef.current, nextEntry];
      return;
    }

    const nextAnswers = [...suggestedAnswersRef.current];
    nextAnswers[existingIndex] = nextEntry;
    suggestedAnswersRef.current = nextAnswers;
  }

  const updateInterviewSession = useCallback(
    async (payload: {
      action: "mark-source" | "complete";
      inputSource?: HirePilotSessionInputSource | null;
      reportEligible?: boolean;
      status?: HirePilotSessionStatus;
      transcript?: string;
      detectedQuestions?: HirePilotDetectedQuestion[];
      suggestedAnswers?: HirePilotSuggestedAnswer[];
    }) => {
      const res = await fetch("/api/hirepilot/session", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await readJsonSafely<HirePilotSessionResponse>(res, {
        ok: false,
        error: "Unable to update the HirePilot session.",
      });

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Unable to update the HirePilot session.");
      }

      return data;
    },
    []
  );

  const markInterviewSessionSource = useCallback(
    async (inputSource: HirePilotSessionInputSource, reportEligible: boolean) => {
      if (!interviewSessionStarted) {
        return;
      }

      if (
        sessionInputSourceRef.current === "tab_audio" &&
        reportEligibleRef.current &&
        inputSource !== "tab_audio"
      ) {
        return;
      }

      sessionInputSourceRef.current = inputSource;
      reportEligibleRef.current = reportEligible;

      try {
        await updateInterviewSession({
          action: "mark-source",
          inputSource,
          reportEligible,
        });
      } catch (error) {
        debugHirePilot("failed to mark interview session source", {
          inputSource,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [interviewSessionStarted, updateInterviewSession]
  );

  const completeInterviewSession = useCallback(
    async (preferredStatus?: HirePilotSessionStatus) => {
      if (!interviewSessionStarted || completingSessionRef.current) {
        return;
      }

      completingSessionRef.current = true;

      const transcript = normalizeSpace(combinedTranscriptRef.current || transcriptRef.current);
      const detectedQuestions = detectedQuestionsRef.current;
      const suggestedAnswers = suggestedAnswersRef.current;
      const hasMeaningfulContent =
        transcript.length >= 80 || detectedQuestions.length > 0 || suggestedAnswers.length > 0;
      const status =
        preferredStatus ?? (hasMeaningfulContent ? "completed" : "canceled");
      const inputSource = sessionInputSourceRef.current;
      const shouldShowReportLoading =
        inputSource === "tab_audio" &&
        reportEligibleRef.current &&
        status === "completed";

      setReportLoading(shouldShowReportLoading);

      try {
        const data = await updateInterviewSession({
          action: "complete",
          inputSource,
          reportEligible: reportEligibleRef.current,
          status,
          transcript,
          detectedQuestions,
          suggestedAnswers,
        });

        const resolvedSource = data.session?.inputSource ?? inputSource ?? null;
        setCompletedSessionSource(resolvedSource);
        setInterviewReport(
          resolvedSource === "tab_audio"
            ? ((data.session?.report ?? null) as HirePilotInterviewReport | null)
            : null
        );
      } catch (error) {
        debugHirePilot("failed to complete interview session", {
          error: error instanceof Error ? error.message : String(error),
        });
        setCompletedSessionSource(null);
        setInterviewReport(null);
      } finally {
        setReportLoading(false);
        setInterviewSessionStarted(false);
        sessionInputSourceRef.current = null;
        reportEligibleRef.current = false;
        completingSessionRef.current = false;
      }
    },
    [interviewSessionStarted, updateInterviewSession]
  );

  const answerStatus = useMemo(() => {
    if (isGenerating) {
      return activeRewrite ? "Refining answer..." : "Generating answer...";
    }
    if (activeMode === "practice" && !answer.trim()) {
      return "Practice mode uses your uploaded resume to generate interview answers.";
    }
    if (!hasPaidHirePilotAccess) {
      return "Practice questions are free. Upgrade to unlock live AI answer suggestions and interview coaching.";
    }
    if (responseSource === "fallback") {
      return "Showing a fallback answer because live AI output is unavailable.";
    }
    if (responseSource === "openai") {
      return "Answer generated from your Hirexa profile context.";
    }
    return "HirePilot uses your profile, resume, experience, and skills.";
  }, [activeMode, activeRewrite, answer, hasPaidHirePilotAccess, isGenerating, responseSource]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;

    if (!Recognition) {
      setIsSupported(false);
      setStatusMessage("Speech recognition is not supported in this browser.");
      return;
    }

    setIsSupported(true);

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setActiveListeningSource("microphone");
      setStatusMessage("Listening to microphone");
      setMicError(null);
    };

    recognition.onresult = (event) => {
      let interimTranscript = "";
      let updatedTranscript = transcriptRef.current;

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const chunk = normalizeSpace(result[0]?.transcript ?? "");
        if (!chunk) continue;

        if (result.isFinal) {
          updatedTranscript = normalizeSpace(`${updatedTranscript} ${chunk}`);
        } else {
          interimTranscript = normalizeSpace(`${interimTranscript} ${chunk}`);
        }
      }

      transcriptRef.current = updatedTranscript;
      const combinedTranscript = normalizeSpace(`${updatedTranscript} ${interimTranscript}`);
      combinedTranscriptRef.current = combinedTranscript;
      setLiveTranscript(combinedTranscript);
      debugHirePilot("transcript updated", {
        length: combinedTranscript.length,
        preview: combinedTranscript.slice(0, 120),
      });
    };

    recognition.onerror = (event) => {
      const message = formatRecognitionError(event.error);
      keepListeningRef.current = false;
      setActiveListeningSource((current) =>
        current === "microphone" ? null : current
      );
      setMicError(message);
      setStatusMessage(message);
    };

    recognition.onend = () => {
      setIsListening(false);

      if (keepListeningRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          keepListeningRef.current = false;
        }
      }
      setActiveListeningSource((current) =>
        current === "microphone" ? null : current
      );
      setStatusMessage("Microphone idle");
    };

    recognitionRef.current = recognition;

    return () => {
      keepListeningRef.current = false;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!copied) return;

    const timeout = window.setTimeout(() => {
      setCopied(false);
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [copied]);

  useEffect(() => {
    return () => {
      keepListeningRef.current = false;
      recognitionRef.current?.abort();

      const recorder = displayRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
    };
  }, []);

  function resetLiveListeningState(nextStatusMessage: string) {
    transcriptRef.current = "";
    combinedTranscriptRef.current = "";
    stopHandledRef.current = false;
    lastQuestionKeyRef.current = "";
    setLiveTranscript("");
    setDetectedQuestion("");
    setDetectionStatus("idle");
    setRequestError(null);
    setMicError(null);
    setStatusMessage(nextStatusMessage);
  }

  function appendTranscribedText(text: string) {
    const chunk = normalizeSpace(text);
    if (!chunk) return;

    transcriptRef.current = normalizeSpace(`${transcriptRef.current} ${chunk}`);
    combinedTranscriptRef.current = transcriptRef.current;
    setLiveTranscript(transcriptRef.current);
    debugHirePilot("display audio transcript updated", {
      length: transcriptRef.current.length,
      preview: transcriptRef.current.slice(0, 120),
    });
  }

  async function transcribeDisplayAudioChunk(blob: Blob) {
    if (!blob.size) return;

    const audioFile = new File([blob], `hirepilot-display-audio-${Date.now()}.webm`, {
      type: blob.type || "audio/webm",
    });
    const formData = new FormData();
    formData.set("audio", audioFile);

    const res = await fetch("/api/hirepilot/transcribe", {
      method: "POST",
      body: formData,
    });

    const data = await readJsonSafely<HirePilotTranscriptionResponse>(res, {
      ok: false,
      error: "Unable to transcribe shared audio.",
    });

    if (!res.ok || data.ok === false) {
      if (res.status === 403) {
        setBillingStatus(toBillingStatus(data));
        setShowPaywall(true);
      }

      throw new Error(data.error || "Unable to transcribe shared audio.");
    }

    appendTranscribedText(data.transcript ?? "");
  }

  function queueDisplayAudioTranscription(blob: Blob) {
    transcriptionQueueRef.current = transcriptionQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await transcribeDisplayAudioChunk(blob);
        } catch (error) {
          setRequestError(
            error instanceof Error ? error.message : "Unable to transcribe shared audio."
          );
        }
      });
  }

  function startDisplayAudioRecorder(session: DisplayAudioCaptureSession) {
    const mimeType = getSupportedDisplayAudioMimeType();
    const recorder = mimeType
      ? new MediaRecorder(session.audioStream, { mimeType })
      : new MediaRecorder(session.audioStream);

    displayRecorderStoppedPromiseRef.current = new Promise<void>((resolve) => {
      displayRecorderStoppedResolveRef.current = resolve;
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        queueDisplayAudioTranscription(event.data);
      }
    };

    recorder.onerror = () => {
      setRequestError("Unable to capture shared tab or app audio.");
    };

    recorder.onstop = () => {
      displayRecorderStoppedResolveRef.current?.();
      displayRecorderStoppedResolveRef.current = null;
      displayRecorderRef.current = null;
    };

    displayRecorderRef.current = recorder;
    recorder.start(4000);
  }

  async function stopDisplayAudioRecorder() {
    const recorder = displayRecorderRef.current;
    const stoppedPromise = displayRecorderStoppedPromiseRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    if (stoppedPromise) {
      await stoppedPromise;
    }

    await transcriptionQueueRef.current.catch(() => undefined);
    displayRecorderStoppedPromiseRef.current = null;
  }

  function applyDetectedQuestion(transcript: string) {
    const rawCandidate = extractInterviewQuestionCandidate(transcript);
    const cleanedQuestion = rawCandidate ? extractInterviewQuestion(rawCandidate) : null;
    const questionKey = normalizeQuestionKey(cleanedQuestion ?? "");

    return cleanedQuestion && questionKey
      ? { rawCandidate, cleanedQuestion, questionKey }
      : { rawCandidate, cleanedQuestion: null, questionKey: "" };
  }

  async function finalizeTranscriptDetection() {
    if (stopHandledRef.current) {
      return;
    }

    stopHandledRef.current = true;
    const finalTranscript = combinedTranscriptRef.current;

    debugHirePilot("stop listening clicked");
    debugHirePilot("final transcript captured", {
      length: finalTranscript.length,
      preview: finalTranscript.slice(0, 160),
    });

    const detected = applyDetectedQuestion(finalTranscript);
    debugHirePilot("extracted raw question candidate", {
      found: Boolean(detected.rawCandidate),
      question: detected.rawCandidate,
    });
    debugHirePilot("cleaned detected question", {
      found: Boolean(detected.cleanedQuestion),
      question: detected.cleanedQuestion,
    });

    if (!detected.cleanedQuestion || !detected.questionKey) {
      setDetectedQuestion("");
      setDetectionStatus("none");
      setAnswer("");
      setResponseSource(null);
      setRequestError(null);
      debugHirePilot("detected question state updated", {
        status: "none",
        question: null,
      });
      return;
    }

    lastQuestionKeyRef.current = detected.questionKey;
    rememberDetectedQuestion(detected.cleanedQuestion);
    setDetectedQuestion(detected.cleanedQuestion);
    setDetectionStatus("found");
    debugHirePilot("detected question state updated", {
      status: "found",
      question: detected.cleanedQuestion,
    });
    await generateAnswer(detected.cleanedQuestion, "default");
  }

  async function generateAnswer(
    question: string,
    mode: RewriteMode,
    answerOverride?: string,
    options?: { practiceMode?: boolean }
  ) {
    const normalizedQuestion = normalizeSpace(question);
    if (!normalizedQuestion) return;
    const practiceMode = options?.practiceMode ?? activeMode === "practice";

    debugHirePilot("answer generation started", {
      mode,
      question: normalizedQuestion,
      practiceMode,
    });

    if (!practiceMode) {
      const accessAllowed = await ensureInterviewSession();
      if (!accessAllowed) return;
    }

    setDetectedQuestion(normalizedQuestion);
    setRequestError(null);
    setIsGenerating(true);
    setActiveRewrite(mode === "default" ? null : mode);

    try {
      const res = await fetch("/api/job-tools/agents/hirepilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: normalizedQuestion,
          mode,
          currentAnswer: answerOverride ?? answer,
          practiceMode,
        }),
      });

      const data = await readJsonSafely<HirePilotResponse>(res, {
        ok: false,
        error: "Invalid server response.",
      });
      if (!res.ok || !data.ok) {
        if (res.status === 403) {
          setBillingStatus(toBillingStatus(data));
          setShowPaywall(true);
        }
        throw new Error(data.error || "Failed to generate an interview answer.");
      }

      setAnswer(data.answer ?? "");
      setTips(Array.isArray(data.tips) && data.tips.length > 0 ? data.tips : defaultTips);
      setResponseSource(data.source ?? null);
      if (!practiceMode && data.answer) {
        rememberSuggestedAnswer(normalizedQuestion, data.answer, data.source ?? null);
      }
      debugHirePilot("answer generation completed", {
        success: true,
        source: data.source ?? null,
      });
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : "Failed to generate an interview answer."
      );
      debugHirePilot("answer generation completed", {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsGenerating(false);
      setActiveRewrite(null);
    }
  }

  const loadHirePilotStatus = useCallback(async () => {
    try {
      setBillingLoading(true);
      const res = await fetch("/api/user/hirepilot-status", {
        cache: "no-store",
      });

      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error("Unable to load HirePilot billing status.");
      }

      const data = await readJsonSafely<HirePilotStatusResponse>(res, {
        hirePilotUnlimited: false,
        hirePilotCredits: 0,
      });
      setBillingStatus(toBillingStatus(data));
    } catch {
      setBillingStatus(toBillingStatus(null));
    } finally {
      setBillingLoading(false);
    }
  }, []);

  const refreshHirePilotAccess = useCallback(async (sessionId: string) => {
    try {
      setBillingLoading(true);

      const res = await fetch("/api/hirepilot/refresh-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) {
        throw new Error("Unable to refresh HirePilot access.");
      }

      const data = await readJsonSafely<HirePilotStatusResponse>(res, {
        hasHirePilotAccess: false,
        hirePilotUnlimited: false,
        hirePilotCredits: 0,
        productKey: null,
        status: null,
        currentPeriodEnd: null,
      });

      setBillingStatus(toBillingStatus(data));
      setShowPaywall(false);
    } catch {
      await loadHirePilotStatus();
    } finally {
      setBillingLoading(false);
    }
  }, [loadHirePilotStatus]);

  useEffect(() => {
    void loadHirePilotStatus();
  }, [loadHirePilotStatus]);

  useEffect(() => {
    if (checkoutState !== "success" || !checkoutSessionId) {
      return;
    }

    void refreshHirePilotAccess(checkoutSessionId);
  }, [checkoutSessionId, checkoutState, refreshHirePilotAccess]);

  async function ensureInterviewSession() {
    if (interviewSessionStarted) {
      return true;
    }

    try {
      setStartingInterview(true);
      setRequestError(null);

      const res = await fetch("/api/hirepilot/start-interview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const data = await readJsonSafely<StartInterviewResponse>(res, {
        ok: false,
        message: "Invalid server response.",
      });

      setBillingStatus(toBillingStatus(data));

      if (!res.ok || !data.started) {
        if (res.status === 403) {
          setShowPaywall(true);
          return false;
        }

        throw new Error(data.message ?? "Unable to start HirePilot.");
      }

      resetInterviewReportState();
      setInterviewSessionStarted(true);
      setShowPaywall(false);
      return true;
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Unable to start HirePilot.");
      return false;
    } finally {
      setStartingInterview(false);
    }
  }

  async function startListening() {
    const recognition = recognitionRef.current;
    if (!recognition || isAnyListening) return;

    const accessAllowed = await ensureInterviewSession();
    if (!accessAllowed) return;

    resetLiveListeningState("Listening to microphone");
    keepListeningRef.current = true;
    debugHirePilot("start listening");

    try {
      recognition.start();
      void markInterviewSessionSource("microphone", false);
      setIsInfoPanelCollapsed(true);
    } catch {
      keepListeningRef.current = false;
      setActiveListeningSource(null);
      setStatusMessage("Unable to start microphone listening.");
      setMicError("Unable to start microphone listening.");
    }
  }

  async function stopListening() {
    keepListeningRef.current = false;
    recognitionRef.current?.stop();
    setActiveListeningSource((current) => (current === "microphone" ? null : current));
    setStatusMessage("Microphone idle");
    await finalizeTranscriptDetection();
    await completeInterviewSession();
  }

  async function handleComputerAudioBeforeConnect() {
    if (isAnyListening) {
      return false;
    }

    const accessAllowed = await ensureInterviewSession();
    return accessAllowed;
  }

  async function handleComputerAudioConnected(session: DisplayAudioCaptureSession) {
    resetLiveListeningState("Listening to shared tab/app audio");
    setActiveListeningSource("computer");
    setIsInfoPanelCollapsed(true);

    try {
      startDisplayAudioRecorder(session);
      await markInterviewSessionSource("tab_audio", true);
    } catch {
      setActiveListeningSource(null);
      setRequestError("Unable to capture shared tab or app audio.");
      session.stop();
    }
  }

  async function handleComputerAudioDisconnected() {
    setActiveListeningSource((current) => (current === "computer" ? null : current));
    await stopDisplayAudioRecorder();
    setStatusMessage("Microphone idle");
    await finalizeTranscriptDetection();
    await completeInterviewSession();
  }

  async function handleCopy() {
    if (!answer.trim()) return;

    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
    } catch {
      setRequestError("Copy failed. Please copy the answer manually.");
    }
  }

  async function handlePracticeQuestion(
    nextIndex?: number,
    options?: { forceGenerate?: boolean }
  ) {
    setCompletedSessionSource(null);
    setInterviewReport(null);
    const safeIndex = typeof nextIndex === "number" ? nextIndex : practiceIndex;
    const question = practiceQuestions[safeIndex] ?? practiceQuestions[0];
    const normalizedQuestion =
      extractInterviewQuestion(question) ?? `${normalizeSpace(question).replace(/[?!.]+$/, "")}?`;
    lastQuestionKeyRef.current = normalizeQuestionKey(normalizedQuestion);
    setDetectedQuestion(normalizedQuestion);
    setDetectionStatus("found");
    setLiveTranscript("");
    transcriptRef.current = "";
    combinedTranscriptRef.current = "";
    setRequestError(null);
    setAnswer("");
    setResponseSource(null);
    setTips(defaultTips);

    if (options?.forceGenerate || autoGeneratePractice) {
      void generateAnswer(normalizedQuestion, "default", undefined, {
        practiceMode: true,
      });
    }
  }

  function handleNextPracticeQuestion() {
    const nextIndex = (practiceIndex + 1) % practiceQuestions.length;
    setPracticeIndex(nextIndex);
    void handlePracticeQuestion(nextIndex);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0F1C] pb-16 pt-28 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-16 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute right-[-8rem] top-1/3 h-[24rem] w-[24rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute left-[-8rem] bottom-0 h-[20rem] w-[20rem] rounded-full bg-blue-700/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {isInfoPanelCollapsed ? (
              <Card className="rounded-[24px] border border-white/12 bg-white/[0.06] shadow-[0_16px_40px_rgba(5,8,22,0.35)] backdrop-blur-xl transition-all duration-200">
                <CardContent className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500">
                        <PaperAirplaneIcon className="h-4 w-4 text-white" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">HirePilot</div>
                        <div className="truncate text-xs text-slate-300">
                          {isAnyListening ? liveListeningLabel : accessBadgeLabel}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsInfoPanelCollapsed(false)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white"
                    aria-label="Expand HirePilot panel"
                  >
                    <ChevronDownIcon className="h-5 w-5" />
                  </button>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="overflow-hidden rounded-[28px] border border-white/12 bg-white/[0.06] shadow-[0_24px_80px_rgba(5,8,22,0.45)] backdrop-blur-2xl transition-all duration-200 lg:hidden">
                  <CardHeader className="gap-6 px-5 py-6 sm:px-6">
                    <div className="space-y-4">
                      <Badge className="w-fit border border-sky-300/20 bg-sky-500/10 text-sky-100 hover:bg-sky-500/10">
                        AI Interview Assistant
                      </Badge>
                      <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200/80">
                          Universal Compatibility
                        </p>
                        <CardTitle className="text-3xl font-semibold tracking-tight text-white">
                          Your Invisible Interview Co-Pilot
                        </CardTitle>
                        <CardDescription className="max-w-2xl text-sm leading-7 text-slate-300">
                          HirePilot works across Zoom, Google Meet, Microsoft Teams,
                          and more, listening in real time so it can detect
                          interview questions and surface instant, invisible
                          support.
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          "Interview Confidently. On Any Platform.",
                          "Real-time question detection",
                          "Instant invisible support",
                        ].map((pill) => (
                          <span
                            key={pill}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-100"
                          >
                            <SparklesIcon className="h-4 w-4 text-sky-300" />
                            {pill}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-200">
                            <MicrophoneIcon className="h-5 w-5" />
                          </span>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200/80">
                              Step 1
                            </p>
                            <p className="mt-1 text-lg font-semibold text-white">
                              Live Listening
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-300">
                          Choose whether HirePilot listens through your
                          microphone or from shared tab/app audio while the
                          interview is happening.
                        </p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                            <div className="text-sm font-semibold text-white">
                              Listen with your microphone
                            </div>
                            <div className="mt-4 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-center text-xs font-medium text-slate-100">
                              Start Listening
                            </div>
                          </div>
                          <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-white">
                              <ComputerDesktopIcon className="h-4 w-4 text-sky-200" />
                              Listen to interview audio
                            </div>
                            <div className="mt-4 rounded-full bg-sky-500 px-4 py-2 text-center text-xs font-semibold text-white">
                              Share tab or app audio
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-200">
                            <ChatBubbleLeftRightIcon className="h-5 w-5" />
                          </span>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200/80">
                              Step 2
                            </p>
                            <p className="mt-1 text-lg font-semibold text-white">
                              Real-Time Detection
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-300">
                          HirePilot picks up likely interview questions in real
                          time so you always know what to answer next.
                        </p>
                        <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-4 text-sm leading-7 text-slate-100">
                          &ldquo;Can you tell me about a time you had to optimize
                          a complex system under a tight deadline?&rdquo;
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-200">
                            <SparklesIcon className="h-5 w-5" />
                          </span>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200/80">
                              Step 3
                            </p>
                            <p className="mt-1 text-lg font-semibold text-white">
                              AI-Generated Answers
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-300">
                          Get instant structured answer help, grounded in your
                          resume, experience, and skills.
                        </p>
                        <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                              STAR-style Preview
                            </p>
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-200">
                              <ClipboardDocumentIcon className="h-3.5 w-3.5 text-sky-300" />
                              Copy
                            </span>
                          </div>
                          <div className="mt-4 space-y-2 text-sm leading-6 text-slate-200">
                            <p>
                              <span className="font-semibold text-white">Situation:</span>{" "}
                              Critical launch performance was slowed by 5-second
                              database queries.
                            </p>
                            <p>
                              <span className="font-semibold text-white">Action:</span>{" "}
                              Added composite indexes and cached frequent reads
                              with Redis.
                            </p>
                            <p>
                              <span className="font-semibold text-white">Result:</span>{" "}
                              Reduced load time below 200ms in 48 hours.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center gap-2">
                        <LightBulbIcon className="h-5 w-5 text-amber-300" />
                        <div className="text-sm font-semibold text-white">
                          Works with your interview workflow
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {compatibilityPlatforms.map((platform) => (
                          <div
                            key={platform.name}
                            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm font-medium text-slate-100"
                          >
                            <span
                              className={[
                                "h-2.5 w-2.5 rounded-full",
                                platform.accentClassName,
                              ].join(" ")}
                            />
                            <span>{platform.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Button
                        type="button"
                        onClick={() => {
                          setActiveMode("live");
                          void startListening();
                        }}
                        disabled={startingInterview}
                        className="w-full rounded-xl bg-sky-600 text-white shadow-[0_18px_40px_rgba(14,165,233,0.28)] hover:bg-sky-500"
                      >
                        <MicrophoneIcon className="h-5 w-5" />
                        {startingInterview ? "Starting..." : "Start HirePilot"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setActiveMode("practice");
                          void handlePracticeQuestion(0);
                        }}
                        disabled={startingInterview}
                        className="w-full rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                      >
                        <PlayCircleIcon className="h-5 w-5" />
                        View Demo
                      </Button>
                    </div>
                  </CardHeader>
                </Card>

                <Card className="hidden overflow-hidden rounded-[28px] border border-white/12 bg-white/[0.06] shadow-[0_24px_80px_rgba(5,8,22,0.45)] backdrop-blur-2xl transition-all duration-200 lg:block">
                  <CardHeader className="gap-6 border-b border-white/10 px-6 py-7 sm:px-8">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="border border-sky-300/20 bg-sky-500/10 text-sky-100 hover:bg-sky-500/10">
                          HirePilot AI
                        </Badge>
                        <Badge className="border border-white/10 bg-white/5 text-slate-200 hover:bg-white/5">
                          Interview Assistant
                        </Badge>
                        <Badge className="border border-white/10 bg-white/5 text-slate-200 hover:bg-white/5">
                          {accessBadgeLabel}
                        </Badge>
                      </div>
                      <div className="space-y-3">
                        <CardTitle className="space-y-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                          <span className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500">
                              <PaperAirplaneIcon className="h-5 w-5 text-white" />
                            </span>
                            <span>HirePilot</span>
                          </span>
                          <span className="block">AI Interview Assistant</span>
                        </CardTitle>
                        <CardDescription className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                          HirePilot listens to interview questions in real time and suggests
                          strong, personalized answers based on your resume, skills, and
                          experience.
                        </CardDescription>
                      </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          "Real-time interview listening",
                          "AI generated answer suggestions",
                          "Resume-aware responses",
                          "Behavioral question guidance",
                          "Confidence coaching",
                        ].map((feature) => (
                          <div
                            key={feature}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200"
                          >
                            {feature}
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3">
                        <Button
                          type="button"
                          onClick={() => {
                            setActiveMode("live");
                            void startListening();
                          }}
                          disabled={startingInterview}
                          className="w-full rounded-xl bg-sky-600 text-white shadow-[0_18px_40px_rgba(14,165,233,0.28)] hover:bg-sky-500"
                        >
                          <MicrophoneIcon className="h-5 w-5" />
                          {startingInterview ? "Starting..." : "Start HirePilot"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setActiveMode("practice");
                            void handlePracticeQuestion(0);
                          }}
                          disabled={startingInterview}
                          className="w-full rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                        >
                          <SparklesIcon className="h-5 w-5" />
                          View Demo
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {["Uses profile", "Uses resume", "Uses experience", "Uses skills"].map(
                        (item) => (
                          <Badge
                            key={item}
                            variant="outline"
                            className="border-sky-300/20 bg-sky-500/10 text-sky-100"
                          >
                            {item}
                          </Badge>
                        )
                      )}
                    </div>
                  </CardHeader>
                </Card>
              </>
            )}

            <div className="space-y-6">
              <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.05] p-1 shadow-sm backdrop-blur">
                <button
                  type="button"
                  onClick={() => setActiveMode("live")}
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-medium transition",
                    activeMode === "live"
                      ? "bg-sky-600 text-white"
                      : "text-slate-300 hover:bg-white/10"
                  )}
                >
                  Live Interview
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode("practice")}
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-medium transition",
                    activeMode === "practice"
                      ? "bg-sky-600 text-white"
                      : "text-slate-300 hover:bg-white/10"
                  )}
                >
                  Practice Interview
                </button>
              </div>

              {activeMode === "live" ? (
                <Card className="rounded-[24px] border border-white/10 bg-white/[0.06] shadow-[0_16px_40px_rgba(5,8,22,0.35)] backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="text-xl text-white">Live Listening Options</CardTitle>
                    <CardDescription className="text-slate-300">
                      Choose whether HirePilot should listen through your microphone or
                      from shared tab/app audio on this computer.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <div className="text-sm font-semibold text-white">
                          Listen with your microphone
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          Use browser speech recognition to capture interview questions as
                          they are spoken around you.
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <Button
                            type="button"
                            onClick={() => void startListening()}
                            disabled={!isSupported || isAnyListening || startingInterview}
                            className="rounded-xl bg-sky-600 px-5 py-3 text-white hover:bg-sky-500"
                          >
                            <MicrophoneIcon className="h-5 w-5" />
                            {startingInterview ? "Starting..." : "Start Listening"}
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void stopListening()}
                            disabled={!isListening}
                            className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                          >
                            <StopIcon className="h-5 w-5" />
                            Stop Listening
                          </Button>

                          <div
                            className={cn(
                              "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
                              isListening
                                ? "bg-emerald-500/15 text-emerald-200"
                                : "bg-white/10 text-slate-300"
                            )}
                          >
                            {isListening ? "Listening to microphone" : statusMessage}
                          </div>
                        </div>
                      </div>

                      <ComputerAudioCaptureCard
                        disabled={startingInterview || (isAnyListening && !isComputerAudioListening)}
                        onBeforeConnect={handleComputerAudioBeforeConnect}
                        onConnected={handleComputerAudioConnected}
                        onDisconnected={handleComputerAudioDisconnected}
                      />
                    </div>

                    {!isSupported ? (
                      <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        This browser does not support speech recognition. Practice mode is still
                        available below.
                      </div>
                    ) : null}

                    {!hasPaidHirePilotAccess ? (
                      <div className="rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                        Practice Interview Questions are free. Live microphone listening and the
                        full HirePilot AI assistant still require a paid plan.
                      </div>
                    ) : null}

                    {hasPaidHirePilotAccess && !billingStatus.hirePilotUnlimited ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                        Each live interview session uses 1 HirePilot credit. Monthly credits are
                        used first, then purchased credits.
                      </div>
                    ) : null}

                    {billingStatus.lowBalance ? (
                      <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        Low balance: you have {billingStatus.hirePilotCredits} HirePilot credit
                        {billingStatus.hirePilotCredits === 1 ? "" : "s"} remaining.
                      </div>
                    ) : null}

                    {billingStatus.hasExpiringCredits ? (
                      <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                        Some purchased HirePilot credits are expiring soon. Review your balance in
                        Settings before they roll off.
                      </div>
                    ) : null}

                    {micError ? (
                      <div className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                        {micError}
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="text-sm font-semibold text-white">Live Transcript</div>
                      <p className="mt-2 min-h-20 text-sm leading-6 text-slate-300">
                        {liveTranscript || "HirePilot will show captured speech here while you are listening."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {activeMode === "practice" ? (
                <Card className="rounded-[24px] border border-white/10 bg-white/[0.06] shadow-[0_16px_40px_rgba(5,8,22,0.35)] backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="text-xl text-white">Practice Interview Questions</CardTitle>
                    <CardDescription className="text-slate-300">
                      Rehearse with guided interview questions before the real conversation.
                      Practice mode is free to use.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {hasPaidHirePilotAccess ? (
                      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                        <div>
                          <div className="text-sm font-semibold text-white">
                            Auto-generate answer
                          </div>
                          <div className="text-xs text-slate-400">
                            Generate a fresh answer as soon as the practice question changes.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAutoGeneratePractice((value) => !value)}
                          aria-pressed={autoGeneratePractice}
                          className={cn(
                            "inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition",
                            autoGeneratePractice
                              ? "bg-sky-600 text-white hover:bg-sky-500"
                              : "bg-white/10 text-slate-200 hover:bg-white/15"
                          )}
                        >
                          {autoGeneratePractice ? "On" : "Off"}
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                        Practice questions are free to use. Upgrade only if you want live
                        listening and AI-generated answer suggestions.
                      </div>
                    )}

                    {requestError?.toLowerCase().includes("upload your resume") ? (
                      <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        Please upload your resume to use practice questions.
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-sky-300/20 bg-sky-500/10 p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
                        HirePilot asks
                      </div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {practiceQuestion}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        onClick={() => void handlePracticeQuestion(undefined, { forceGenerate: true })}
                        disabled={startingInterview}
                        className="rounded-xl bg-sky-600 px-5 py-3 text-white hover:bg-sky-500"
                      >
                        <SparklesIcon className="h-5 w-5" />
                        {startingInterview ? "Starting..." : "Use This Question"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleNextPracticeQuestion}
                        disabled={startingInterview}
                        className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                      >
                        <ArrowPathIcon className="h-5 w-5" />
                        Next Question
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            <Card className="rounded-[24px] border border-white/10 bg-white/[0.06] shadow-[0_16px_40px_rgba(5,8,22,0.35)] backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl text-white">Detected Question</CardTitle>
                <CardDescription className="text-slate-300">
                  When HirePilot hears a likely interview question, it will appear here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 text-lg font-medium text-white">
                  {detectedQuestionText}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border border-white/10 bg-white/[0.06] shadow-[0_16px_40px_rgba(5,8,22,0.35)] backdrop-blur-xl">
              <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="text-xl text-white">Suggested Answer</CardTitle>
                    <CardDescription className="mt-1 text-slate-300">
                      {answerStatus}
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCopy}
                      disabled={!answer.trim()}
                      className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    >
                      <ClipboardDocumentIcon className="h-5 w-5" />
                      {copied ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        generateAnswer(detectedQuestion, "shorten", undefined, {
                          practiceMode: activeMode === "practice",
                        })
                      }
                      disabled={!detectedQuestion || answerActionsDisabled}
                      className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    >
                      Shorten
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        generateAnswer(detectedQuestion, "expand", undefined, {
                          practiceMode: activeMode === "practice",
                        })
                      }
                      disabled={!detectedQuestion || answerActionsDisabled}
                      className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    >
                      Expand
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        generateAnswer(detectedQuestion, "professional", undefined, {
                          practiceMode: activeMode === "practice",
                        })
                      }
                      disabled={!detectedQuestion || answerActionsDisabled}
                      className="rounded-xl bg-sky-600 text-white hover:bg-sky-500"
                    >
                      More Professional
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {requestError ? (
                  <div className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {requestError}
                  </div>
                ) : null}

                <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4 shadow-inner shadow-black/20">
                  <Textarea
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="HirePilot will generate a professional interview answer here."
                    className="min-h-[280px] resize-none border-0 bg-transparent p-0 text-sm leading-7 text-slate-100 shadow-none placeholder:text-slate-500 focus-visible:ring-0"
                  />
                </div>

                {isGenerating ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1 text-sm text-sky-100">
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    {activeRewrite ? "Refining answer..." : "Generating answer..."}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {activeMode === "live" &&
            (reportLoading || (completedSessionSource === "tab_audio" && interviewReport)) ? (
              <Card className="rounded-[24px] border border-white/10 bg-white/[0.06] shadow-[0_16px_40px_rgba(5,8,22,0.35)] backdrop-blur-xl">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-xl text-white">Interview Report</CardTitle>
                      <CardDescription className="mt-1 text-slate-300">
                        Interview Report is only available for completed sessions captured from
                        shared tab or app audio.
                      </CardDescription>
                    </div>
                    <Badge className="border border-sky-300/20 bg-sky-500/10 text-sky-100">
                      {reportLoading ? "Generating..." : "Available"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {reportLoading || !interviewReport ? (
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
                      Building your post-interview summary and coaching notes.
                    </div>
                  ) : (
                    <>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <div className="text-sm font-semibold text-white">Interview Summary</div>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {interviewReport.summary}
                        </p>
                        <div className="mt-2 text-xs text-slate-400">
                          Interview date/time: {interviewReport.interviewDateTime}
                        </div>
                      </div>

                      {interviewReport.interviewTopics.length > 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <div className="text-sm font-semibold text-white">Detected Topics</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {interviewReport.interviewTopics.map((topic) => (
                              <span
                                key={topic}
                                className="rounded-full border border-sky-300/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-100"
                              >
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {interviewReport.strongestAnswers.length > 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <div className="text-sm font-semibold text-white">Strongest Answers</div>
                          <div className="mt-3 space-y-3">
                            {interviewReport.strongestAnswers.map((item) => (
                              <div
                                key={item.question}
                                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                              >
                                <div className="text-sm font-semibold text-white">
                                  {item.question}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-slate-300">
                                  {item.answer}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-4 lg:grid-cols-2">
                        {interviewReport.weakerAnswerOpportunities.length > 0 ? (
                          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                            <div className="text-sm font-semibold text-white">
                              Weaker Answer Opportunities
                            </div>
                            <div className="mt-3 space-y-2">
                              {interviewReport.weakerAnswerOpportunities.map((item) => (
                                <div
                                  key={item}
                                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300"
                                >
                                  {item}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {interviewReport.followUpQuestions.length > 0 ? (
                          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                            <div className="text-sm font-semibold text-white">
                              Follow-up Questions to Prepare For
                            </div>
                            <div className="mt-3 space-y-2">
                              {interviewReport.followUpQuestions.map((item) => (
                                <div
                                  key={item}
                                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300"
                                >
                                  {item}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <div className="text-sm font-semibold text-white">Coaching Tips</div>
                          <div className="mt-3 space-y-2">
                            {interviewReport.coachingTips.map((tip) => (
                              <div
                                key={tip}
                                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300"
                              >
                                {tip}
                              </div>
                            ))}
                          </div>
                          <p className="mt-4 text-sm leading-6 text-slate-300">
                            {interviewReport.overallSummary}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <div className="text-sm font-semibold text-white">Feedback</div>
                          <div className="mt-3 space-y-3 text-sm text-slate-300">
                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                              Confidence: {interviewReport.feedback.confidence}
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                              Clarity: {interviewReport.feedback.clarity}
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                              Specificity: {interviewReport.feedback.specificity}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <aside className="space-y-6">
            <Card className="rounded-[24px] border border-white/10 bg-white/[0.06] shadow-[0_16px_40px_rgba(5,8,22,0.35)] backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl text-white">Interview Tips</CardTitle>
                <CardDescription className="text-slate-300">
                  Quick guidance to keep your answers sharp and credible.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-sky-300/20 bg-sky-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-sky-100 shadow-sm">
                      <LightBulbIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Tip</div>
                      <p className="mt-1 text-sm leading-6 text-slate-300">
                        Structure answers using STAR method.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {tips.map((tip) => (
                    <div
                      key={tip}
                      className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm leading-6 text-slate-300"
                    >
                      {tip}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border border-white/10 bg-slate-950/60 text-slate-50 shadow-xl shadow-slate-950/30 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl text-white">HirePilot Workflow</CardTitle>
                <CardDescription className="text-slate-300">
                  Real-time interview support without changing your existing onboarding flow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-slate-200">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  1. Detect the interview question from your microphone or practice mode.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  2. Pull context from your saved profile, resume, experience, and skills.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  3. Generate an answer you can copy, shorten, expand, or make more professional.
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border border-white/10 bg-white/[0.06] shadow-[0_16px_40px_rgba(5,8,22,0.35)] backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl text-white">Access Status</CardTitle>
                <CardDescription className="text-slate-300">
                  Your HirePilot plan controls live interview usage and credit access.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-300">
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                  {billingLoading
                    ? "Checking HirePilot access..."
                    : billingStatus.hirePilotUnlimited
                    ? "Unlimited HirePilot subscription active."
                    : billingStatus.hirePilotCredits > 0
                    ? `${billingStatus.hirePilotCredits} credits remaining.`
                    : billingStatus.productKey === "hirepilot_monthly" &&
                        billingStatus.status === "active"
                      ? "HirePilot subscription is active, but no credits are available right now."
                      : "Practice questions are free. Live HirePilot access is not active."}
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                  {billingStatus.hirePilotUnlimited ? (
                    <>
                      <div>Unlimited live access active.</div>
                      {billingStatus.currentPeriodEnd ? (
                        <div className="mt-1 text-xs text-slate-400">
                          Current billing period ends:{" "}
                          {new Date(billingStatus.currentPeriodEnd).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div>Monthly credits: {monthlyCreditBucket}</div>
                      <div className="mt-1">
                        Purchased credits: {billingStatus.purchasedCredits ?? 0}
                      </div>
                      {billingStatus.nextMonthlyResetAt ? (
                        <div className="mt-1 text-xs text-slate-400">
                          Next monthly reset:{" "}
                          {new Date(billingStatus.nextMonthlyResetAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      ) : null}
                      {billingStatus.earliestPurchasedExpiryAt ? (
                        <div className="mt-1 text-xs text-slate-400">
                          Earliest purchased expiry:{" "}
                          {new Date(
                            billingStatus.earliestPurchasedExpiryAt
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                  Start a live session for real-time listening, or use practice mode for demo
                  prompts and answer rehearsal.
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      {showPaywall ? (
        <HirePilotPaywall
          onClose={() => {
            setShowPaywall(false);
            void loadHirePilotStatus();
          }}
        />
      ) : null}
    </div>
  );
}
