"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
  LightBulbIcon,
  MicrophoneIcon,
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
import HirePilotPaywall from "@/app/components/hirepilot/HirePilotPaywall";
import { Textarea } from "@/app/components/ui/textarea";
import {
  extractInterviewQuestion,
  extractInterviewQuestionCandidate,
} from "@/app/lib/hirepilot/extractInterviewQuestion";
import { cn } from "@/app/lib/utils";

type RewriteMode = "default" | "shorten" | "expand" | "professional";
type PracticeMode = "live" | "practice";
type DetectionStatus = "idle" | "found" | "none";

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
  productKey?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
};

type StartInterviewResponse = {
  ok?: boolean;
  started?: boolean;
  message?: string;
  hasHirePilotAccess?: boolean;
  hirePilotUnlimited?: boolean;
  hirePilotCredits?: number;
  productKey?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
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
    productKey: data?.productKey ?? null,
    status: data?.status ?? null,
    currentPeriodEnd: data?.currentPeriodEnd ?? null,
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

  const [activeMode, setActiveMode] = useState<PracticeMode>("live");
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
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
    productKey: null,
    status: null,
    currentPeriodEnd: null,
  });
  const [billingLoading, setBillingLoading] = useState(true);
  const [startingInterview, setStartingInterview] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [interviewSessionStarted, setInterviewSessionStarted] = useState(false);

  const practiceQuestion = practiceQuestions[practiceIndex] ?? practiceQuestions[0];

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
    : "Practice Questions Free";

  const answerStatus = useMemo(() => {
    if (isGenerating) {
      return activeRewrite ? "Refining answer..." : "Generating answer...";
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
  }, [activeRewrite, hasPaidHirePilotAccess, isGenerating, responseSource]);

  useEffect(() => {
    void loadHirePilotStatus();
  }, []);

  useEffect(() => {
    if (checkoutState !== "success" || !checkoutSessionId) {
      return;
    }

    void refreshHirePilotAccess(checkoutSessionId);
  }, [checkoutSessionId, checkoutState]);

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
      setStatusMessage("Listening...");
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

  function applyDetectedQuestion(transcript: string) {
    const rawCandidate = extractInterviewQuestionCandidate(transcript);
    const cleanedQuestion = rawCandidate ? extractInterviewQuestion(rawCandidate) : null;
    const questionKey = normalizeQuestionKey(cleanedQuestion ?? "");

    return cleanedQuestion && questionKey
      ? { rawCandidate, cleanedQuestion, questionKey }
      : { rawCandidate, cleanedQuestion: null, questionKey: "" };
  }

  function finalizeTranscriptDetection() {
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
    setDetectedQuestion(detected.cleanedQuestion);
    setDetectionStatus("found");
    debugHirePilot("detected question state updated", {
      status: "found",
      question: detected.cleanedQuestion,
    });
    void generateAnswer(detected.cleanedQuestion, "default");
  }

  async function generateAnswer(
    question: string,
    mode: RewriteMode,
    answerOverride?: string
  ) {
    const normalizedQuestion = normalizeSpace(question);
    if (!normalizedQuestion) return;

    debugHirePilot("answer generation started", {
      mode,
      question: normalizedQuestion,
    });

    const accessAllowed = await ensureInterviewSession();
    if (!accessAllowed) return;

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

  async function loadHirePilotStatus() {
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
  }

  async function refreshHirePilotAccess(sessionId: string) {
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
  }

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
    if (!recognition || isListening) return;

    const accessAllowed = await ensureInterviewSession();
    if (!accessAllowed) return;

    transcriptRef.current = "";
    combinedTranscriptRef.current = "";
    stopHandledRef.current = false;
    lastQuestionKeyRef.current = "";
    setLiveTranscript("");
    setDetectedQuestion("");
    setDetectionStatus("idle");
    setRequestError(null);
    setMicError(null);
    setStatusMessage("Listening...");
    keepListeningRef.current = true;
    debugHirePilot("start listening");

    try {
      recognition.start();
    } catch {
      keepListeningRef.current = false;
      setStatusMessage("Unable to start microphone listening.");
      setMicError("Unable to start microphone listening.");
    }
  }

  function stopListening() {
    keepListeningRef.current = false;
    finalizeTranscriptDetection();
    recognitionRef.current?.stop();
    setStatusMessage("Microphone idle");
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

  async function handlePracticeQuestion(nextIndex?: number) {
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

    if (!hasPaidHirePilotAccess) {
      setAnswer("");
      setResponseSource(null);
      setTips(defaultTips);
      return;
    }

    if (autoGeneratePractice) {
      void generateAnswer(normalizedQuestion, "default");
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
            <Card className="overflow-hidden rounded-[28px] border border-white/12 bg-white/[0.06] shadow-[0_24px_80px_rgba(5,8,22,0.45)] backdrop-blur-2xl">
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
                    <CardTitle className="text-xl text-white">Microphone Control Panel</CardTitle>
                    <CardDescription className="text-slate-300">
                      Use speech recognition to capture interview questions as they are spoken.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        onClick={() => void startListening()}
                        disabled={!isSupported || isListening || startingInterview}
                        className="rounded-xl bg-sky-600 px-5 py-3 text-white hover:bg-sky-500"
                      >
                        <MicrophoneIcon className="h-5 w-5" />
                        {startingInterview ? "Starting..." : "Start Listening"}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={stopListening}
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
                        {isListening ? "Listening..." : statusMessage}
                      </div>
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
                        onClick={() => void handlePracticeQuestion()}
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
                  "{detectedQuestionText}"
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
                      onClick={() => generateAnswer(detectedQuestion, "shorten")}
                      disabled={!detectedQuestion || answerActionsDisabled}
                      className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    >
                      Shorten
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => generateAnswer(detectedQuestion, "expand")}
                      disabled={!detectedQuestion || answerActionsDisabled}
                      className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    >
                      Expand
                    </Button>
                    <Button
                      type="button"
                      onClick={() => generateAnswer(detectedQuestion, "professional")}
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
                    ? "Unlimited plan active."
                    : billingStatus.hirePilotCredits > 0
                    ? `${billingStatus.hirePilotCredits} credits remaining.`
                    : "Practice questions are free. Live HirePilot access is not active."}
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
