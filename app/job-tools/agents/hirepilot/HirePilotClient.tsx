"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
  LightBulbIcon,
  MicrophoneIcon,
  RocketLaunchIcon,
  SparklesIcon,
  StopIcon,
} from "@heroicons/react/24/outline";

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
import { cn } from "@/app/lib/utils";

type RewriteMode = "default" | "shorten" | "expand" | "professional";
type PracticeMode = "live" | "practice";

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
  hirePilotUnlimited: boolean;
  hirePilotCredits: number;
};

type StartInterviewResponse = {
  ok?: boolean;
  started?: boolean;
  message?: string;
  hirePilotUnlimited?: boolean;
  hirePilotCredits?: number;
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

const questionStarters = [
  "tell me",
  "walk me",
  "what",
  "why",
  "how",
  "when",
  "where",
  "can you",
  "could you",
  "would you",
  "describe",
  "give me",
  "have you",
  "do you",
];

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeQuestionKey(value: string) {
  return normalizeSpace(value).toLowerCase().replace(/[?!.,]+$/g, "");
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

function ensureQuestionPunctuation(value: string) {
  const trimmed = normalizeSpace(value).replace(/^["']|["']$/g, "");
  if (!trimmed) return "";
  if (/[?!.]$/.test(trimmed)) return trimmed;
  return `${trimmed}?`;
}

function extractDetectedQuestion(transcript: string) {
  const normalized = normalizeSpace(transcript);
  if (!normalized) return "";

  const segments = normalized
    .split(/(?<=[.?!])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    const lowered = segment.toLowerCase();
    if (segment.length < 10) continue;
    if (segment.endsWith("?") || questionStarters.some((starter) => lowered.startsWith(starter))) {
      return ensureQuestionPunctuation(segment);
    }
  }

  const lowered = normalized.toLowerCase();
  if (questionStarters.some((starter) => lowered.startsWith(starter))) {
    return ensureQuestionPunctuation(normalized);
  }

  return "";
}

async function readJsonSafely<T>(res: Response, fallback: T) {
  try {
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export default function HirePilotClient() {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const keepListeningRef = useRef(false);
  const transcriptRef = useRef("");
  const lastQuestionKeyRef = useRef("");

  const [activeMode, setActiveMode] = useState<PracticeMode>("live");
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Microphone idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [detectedQuestion, setDetectedQuestion] = useState("");
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
    hirePilotUnlimited: false,
    hirePilotCredits: 0,
  });
  const [billingLoading, setBillingLoading] = useState(true);
  const [startingInterview, setStartingInterview] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [interviewSessionStarted, setInterviewSessionStarted] = useState(false);

  const practiceQuestion = practiceQuestions[practiceIndex] ?? practiceQuestions[0];

  const answerActionsDisabled = !answer.trim() || isGenerating;
  const detectedQuestionText = detectedQuestion || "Waiting for a question.";

  const answerStatus = useMemo(() => {
    if (isGenerating) {
      return activeRewrite ? "Refining answer..." : "Generating answer...";
    }
    if (responseSource === "fallback") {
      return "Showing a fallback answer because live AI output is unavailable.";
    }
    if (responseSource === "openai") {
      return "Answer generated from your Hirexa profile context.";
    }
    return "HirePilot uses your profile, resume, experience, and skills.";
  }, [activeRewrite, isGenerating, responseSource]);

  useEffect(() => {
    void loadHirePilotStatus();
  }, []);

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
      setLiveTranscript(combinedTranscript);

      const question = extractDetectedQuestion(combinedTranscript);
      const questionKey = normalizeQuestionKey(question);
      if (question && questionKey && questionKey !== lastQuestionKeyRef.current) {
        lastQuestionKeyRef.current = questionKey;
        setDetectedQuestion(question);
        void generateAnswer(question, "default");
      }
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

  async function generateAnswer(
    question: string,
    mode: RewriteMode,
    answerOverride?: string
  ) {
    const normalizedQuestion = normalizeSpace(question);
    if (!normalizedQuestion) return;

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
          setBillingStatus({
            hirePilotUnlimited: Boolean(data.hirePilotUnlimited),
            hirePilotCredits: Number(data.hirePilotCredits ?? 0),
          });
          setShowPaywall(true);
        }
        throw new Error(data.error || "Failed to generate an interview answer.");
      }

      setAnswer(data.answer ?? "");
      setTips(Array.isArray(data.tips) && data.tips.length > 0 ? data.tips : defaultTips);
      setResponseSource(data.source ?? null);
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : "Failed to generate an interview answer."
      );
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
      setBillingStatus({
        hirePilotUnlimited: Boolean(data.hirePilotUnlimited),
        hirePilotCredits: Number(data.hirePilotCredits ?? 0),
      });
    } catch {
      setBillingStatus({
        hirePilotUnlimited: false,
        hirePilotCredits: 0,
      });
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

      setBillingStatus({
        hirePilotUnlimited: Boolean(data.hirePilotUnlimited),
        hirePilotCredits: Number(data.hirePilotCredits ?? 0),
      });

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
    lastQuestionKeyRef.current = "";
    setLiveTranscript("");
    setDetectedQuestion("");
    setMicError(null);
    setStatusMessage("Listening...");
    keepListeningRef.current = true;

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
    const accessAllowed = await ensureInterviewSession();
    if (!accessAllowed) return;

    const safeIndex = typeof nextIndex === "number" ? nextIndex : practiceIndex;
    const question = practiceQuestions[safeIndex] ?? practiceQuestions[0];
    const normalizedQuestion = ensureQuestionPunctuation(question);
    lastQuestionKeyRef.current = normalizeQuestionKey(normalizedQuestion);
    setDetectedQuestion(normalizedQuestion);
    setLiveTranscript("");
    transcriptRef.current = "";

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_42%),linear-gradient(180deg,_#f8fafc_0%,_#eff6ff_45%,_#e2e8f0_100%)] pb-16 pt-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-xl shadow-slate-200/60 backdrop-blur">
              <CardHeader className="gap-4 border-b border-slate-200/70 bg-white/80">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/25">
                    <RocketLaunchIcon className="h-6 w-6" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-3xl text-slate-950">HirePilot</CardTitle>
                      <Badge className="bg-blue-600 text-white hover:bg-blue-600">NEW</Badge>
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-white text-slate-700"
                      >
                        {billingLoading
                          ? "Checking access..."
                          : billingStatus.hirePilotUnlimited
                          ? "Unlimited Access"
                          : billingStatus.hirePilotCredits > 0
                          ? `Credits Remaining: ${billingStatus.hirePilotCredits}`
                          : "Locked"}
                      </Badge>
                    </div>
                    <CardDescription className="max-w-2xl text-sm text-slate-600">
                      Turn on your microphone, let HirePilot detect interview questions in real
                      time, and get polished answers grounded in your Hirexa profile.
                    </CardDescription>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                    Uses userProfile
                  </Badge>
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                    Uses resume
                  </Badge>
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                    Uses experience
                  </Badge>
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                    Uses skills
                  </Badge>
                </div>
              </CardHeader>
            </Card>

            <div className="space-y-6">
              <div className="inline-flex rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setActiveMode("live")}
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-medium transition",
                    activeMode === "live"
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:bg-slate-100"
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
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  Practice Interview
                </button>
              </div>

              {activeMode === "live" ? (
                <Card className="border-slate-200 bg-white/90 shadow-lg shadow-slate-200/50">
                  <CardHeader>
                    <CardTitle className="text-xl text-slate-950">Microphone Control Panel</CardTitle>
                    <CardDescription className="text-slate-600">
                      Use speech recognition to capture interview questions as they are spoken.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        onClick={() => void startListening()}
                        disabled={!isSupported || isListening || startingInterview}
                        className="rounded-xl bg-blue-600 px-5 py-3 text-white hover:bg-blue-700"
                      >
                        <MicrophoneIcon className="h-5 w-5" />
                        {startingInterview ? "Starting..." : "Start Listening"}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={stopListening}
                        disabled={!isListening}
                        className="rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      >
                        <StopIcon className="h-5 w-5" />
                        Stop Listening
                      </Button>

                      <div
                        className={cn(
                          "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
                          isListening
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {isListening ? "Listening..." : statusMessage}
                      </div>
                    </div>

                    {!isSupported ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        This browser does not support speech recognition. Practice mode is still
                        available below.
                      </div>
                    ) : null}

                    {micError ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {micError}
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-semibold text-slate-900">Live Transcript</div>
                      <p className="mt-2 min-h-20 text-sm leading-6 text-slate-600">
                        {liveTranscript || "HirePilot will show captured speech here while you are listening."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {activeMode === "practice" ? (
                <Card className="border-slate-200 bg-white/90 shadow-lg shadow-slate-200/50">
                  <CardHeader>
                    <CardTitle className="text-xl text-slate-950">Practice Interview Mode</CardTitle>
                    <CardDescription className="text-slate-600">
                      HirePilot can ask common interview questions so you can rehearse before the
                      real conversation.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          Auto-generate answer
                        </div>
                        <div className="text-xs text-slate-500">
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
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                        )}
                      >
                        {autoGeneratePractice ? "On" : "Off"}
                      </button>
                    </div>

                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                        HirePilot asks
                      </div>
                      <div className="mt-2 text-xl font-semibold text-slate-950">
                        {practiceQuestion}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        onClick={() => void handlePracticeQuestion()}
                        disabled={startingInterview}
                        className="rounded-xl bg-blue-600 px-5 py-3 text-white hover:bg-blue-700"
                      >
                        <SparklesIcon className="h-5 w-5" />
                        {startingInterview ? "Starting..." : "Use This Question"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleNextPracticeQuestion}
                        disabled={startingInterview}
                        className="rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      >
                        <ArrowPathIcon className="h-5 w-5" />
                        Next Question
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            <Card className="border-slate-200 bg-white/90 shadow-lg shadow-slate-200/50">
              <CardHeader>
                <CardTitle className="text-xl text-slate-950">Detected Question</CardTitle>
                <CardDescription className="text-slate-600">
                  When HirePilot hears a likely interview question, it will appear here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-lg font-medium text-slate-900">
                  "{detectedQuestionText}"
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white/90 shadow-lg shadow-slate-200/50">
              <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="text-xl text-slate-950">Suggested Answer</CardTitle>
                    <CardDescription className="mt-1 text-slate-600">
                      {answerStatus}
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCopy}
                      disabled={!answer.trim()}
                      className="rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    >
                      <ClipboardDocumentIcon className="h-5 w-5" />
                      {copied ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => generateAnswer(detectedQuestion, "shorten")}
                      disabled={!detectedQuestion || answerActionsDisabled}
                      className="rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    >
                      Shorten
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => generateAnswer(detectedQuestion, "expand")}
                      disabled={!detectedQuestion || answerActionsDisabled}
                      className="rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    >
                      Expand
                    </Button>
                    <Button
                      type="button"
                      onClick={() => generateAnswer(detectedQuestion, "professional")}
                      disabled={!detectedQuestion || answerActionsDisabled}
                      className="rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                    >
                      More Professional
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {requestError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {requestError}
                  </div>
                ) : null}

                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-inner shadow-slate-100">
                  <Textarea
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="HirePilot will generate a professional interview answer here."
                    className="min-h-[280px] resize-none border-0 p-0 text-sm leading-7 text-slate-700 shadow-none focus-visible:ring-0"
                  />
                </div>

                {isGenerating ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    {activeRewrite ? "Refining answer..." : "Generating answer..."}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card className="border-slate-200 bg-white/90 shadow-lg shadow-slate-200/50">
              <CardHeader>
                <CardTitle className="text-xl text-slate-950">Interview Tips</CardTitle>
                <CardDescription className="text-slate-600">
                  Quick guidance to keep your answers sharp and credible.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                      <LightBulbIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Tip</div>
                      <p className="mt-1 text-sm leading-6 text-slate-700">
                        Structure answers using STAR method.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {tips.map((tip) => (
                    <div
                      key={tip}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700"
                    >
                      {tip}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-slate-950 text-slate-50 shadow-xl shadow-slate-400/10">
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
