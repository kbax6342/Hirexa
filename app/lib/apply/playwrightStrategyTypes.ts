import type { ApplyStopPageType, ApplyStopReason } from "@/app/lib/apply/stopClassification";

export type ApplySiteStrategyStepType =
  | "goto"
  | "navigation"
  | "click"
  | "fill"
  | "select_option"
  | "toggle";

export type ApplySiteStrategyStep = {
  id: string;
  type: ApplySiteStrategyStepType;
  selector?: string;
  label?: string;
  text?: string;
  value?: string;
  checked?: boolean;
  currentUrl: string;
  timestamp: string;
};

export type ApplySiteStrategyReplayStatus =
  | "IDLE"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export type ApplySiteStrategyReplayResult = {
  status: "COMPLETED" | "FAILED";
  currentUrl?: string;
  reason?: string;
  failingStepId?: string;
  completedStepCount?: number;
  totalStepCount?: number;
};

export type ApplySiteStrategyStatus =
  | "draft"
  | "tested_once"
  | "working"
  | "unstable";

export type ApplySiteStrategyType =
  | "aggregator_handoff"
  | "direct_apply"
  | "verification_blocker"
  | "generic_navigation";

export type ApplySiteStrategyTrainingSource = "playwright_recording";

export type ApplySiteStrategyRecord = {
  id?: string;
  strategyKey?: string;
  hostname: string;
  sourceHost?: string;
  destinationHost?: string;
  strategyType?: ApplySiteStrategyType | string;
  pageType?: ApplyStopPageType | string;
  finalUrl: string;
  lastAction: string;
  stopReason: string;
  supportedReasons?: ApplyStopReason[];
  status: ApplySiteStrategyStatus;
  successCount: number;
  failureCount: number;
  successfulReplays: number;
  failedReplays: number;
  lastReplaySucceeded?: boolean;
  lastFailureReason?: string;
  instructions: string;
  selectors?: string;
  steps?: ApplySiteStrategyStep[];
  rawSteps?: ApplySiteStrategyStep[];
  sanitizedSteps?: ApplySiteStrategyStep[];
  jobTitle?: string;
  company?: string;
  location?: string;
  derivedInstruction?: string;
  automationPrompt?: string;
  aiSummary?: string;
  generatedCodexPrompt?: string;
  promptGeneratedAt?: string;
  promptModel?: string;
  promptReasoningEffort?: string;
  promptWarning?: string;
  promptGenerationSucceeded?: boolean;
  trainingSource?: ApplySiteStrategyTrainingSource;
  lastTrainedUrl?: string;
  replayStatus?: ApplySiteStrategyReplayStatus;
  lastReplayedAt?: string;
  lastReplayAt?: string;
  lastReplayResult?: ApplySiteStrategyReplayResult;
  failingStepId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ApplySiteStrategyStore = Record<string, ApplySiteStrategyRecord>;

export type ApplySiteStrategyExportEnvelope = {
  version: 1;
  exportedAt: string;
  overwriteExisting: boolean;
  strategies: ApplySiteStrategyStore;
};

export type ApplySiteStrategySaveInput = {
  hostname?: string;
  sourceHost?: string;
  destinationHost?: string;
  finalUrl?: string;
  lastAction?: string;
  stopReason?: string;
  supportedReasons?: ApplyStopReason[];
  instructions?: string;
  selectors?: string;
  errorMessage?: string;
  steps?: ApplySiteStrategyStep[];
  trainingSource?: ApplySiteStrategyTrainingSource;
  lastTrainedUrl?: string;
  jobTitle?: string;
  company?: string;
  location?: string;
  pageType?: ApplyStopPageType;
  strategyType?: ApplySiteStrategyType;
};

export type ApplySiteStrategyReplayUpdateInput = {
  strategyId?: string;
  strategyKey?: string;
  hostname?: string;
  replayStatus: ApplySiteStrategyReplayStatus;
  lastReplayedAt?: string;
  lastReplayResult?: ApplySiteStrategyReplayResult | null;
  failingStepId?: string | null;
};

export function deriveApplySiteStrategyStatus(args: {
  successCount: number;
  failureCount: number;
  lastReplaySucceeded?: boolean;
}) {
  if (args.lastReplaySucceeded === false && args.successCount > 0) {
    return "unstable" satisfies ApplySiteStrategyStatus;
  }

  if (args.successCount >= 2) {
    return "working" satisfies ApplySiteStrategyStatus;
  }

  if (args.successCount === 1) {
    return "tested_once" satisfies ApplySiteStrategyStatus;
  }

  if (args.failureCount > 0 && args.successCount === 0) {
    return "draft" satisfies ApplySiteStrategyStatus;
  }

  return "draft" satisfies ApplySiteStrategyStatus;
}
