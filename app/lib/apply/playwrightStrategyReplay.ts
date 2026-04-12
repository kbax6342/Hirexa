import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright";

type ReplayableStrategyStep = {
  id: string;
  type: "goto" | "navigation" | "click" | "fill" | "select_option" | "toggle";
  selector?: string;
  label?: string;
  text?: string;
  value?: string;
  checked?: boolean;
  currentUrl: string;
  timestamp: string;
};

export type PlaywrightStrategyReplayStep = ReplayableStrategyStep & {
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  reason?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type PlaywrightStrategyReplayResult = {
  status: "COMPLETED" | "FAILED";
  currentUrl: string | null;
  reason?: string | null;
  failingStepId?: string | null;
  completedStepCount: number;
  totalStepCount: number;
};

export type PlaywrightStrategyReplaySessionSummary = {
  id: string;
  hostname: string;
  startUrl: string;
  finalUrl: string;
  stopReason: string;
  lastAction: string;
  status: "STARTING" | "RUNNING" | "COMPLETED" | "FAILED";
  startedAt: string;
  updatedAt: string;
  currentUrl: string | null;
  stepCount: number;
  completedStepCount: number;
  failingStepId?: string | null;
  error?: string | null;
  lastReplayedAt?: string | null;
  lastReplayResult?: PlaywrightStrategyReplayResult | null;
  steps: PlaywrightStrategyReplayStep[];
};

type RuntimeReplaySession = {
  summary: PlaywrightStrategyReplaySessionSummary;
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
};

declare global {
  // eslint-disable-next-line no-var
  var __hirexaPlaywrightStrategyReplaySessions:
    | Map<string, RuntimeReplaySession>
    | undefined;
}

const DEFAULT_STEP_TIMEOUT_MS = 7000;

function getReplayStore() {
  if (!globalThis.__hirexaPlaywrightStrategyReplaySessions) {
    globalThis.__hirexaPlaywrightStrategyReplaySessions = new Map();
  }

  return globalThis.__hirexaPlaywrightStrategyReplaySessions;
}

function makeReplaySessionId() {
  return `replay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function asSummary(
  session: RuntimeReplaySession,
): PlaywrightStrategyReplaySessionSummary {
  return {
    ...session.summary,
    steps: [...session.summary.steps],
  };
}

function touchSession(session: RuntimeReplaySession) {
  session.summary.updatedAt = new Date().toISOString();
}

function setCurrentUrl(session: RuntimeReplaySession, currentUrl: string | null) {
  session.summary.currentUrl = currentUrl;
  touchSession(session);
}

function getCompletedStepCount(steps: PlaywrightStrategyReplayStep[]) {
  return steps.filter((step) => step.status === "COMPLETED").length;
}

function updateReplayStep(
  session: RuntimeReplaySession,
  stepId: string,
  patch: Partial<PlaywrightStrategyReplayStep>,
) {
  session.summary.steps = session.summary.steps.map((step) =>
    step.id === stepId ? { ...step, ...patch } : step,
  );
  session.summary.completedStepCount = getCompletedStepCount(session.summary.steps);
  touchSession(session);
}

function markReplaySessionStatus(
  session: RuntimeReplaySession,
  status: PlaywrightStrategyReplaySessionSummary["status"],
  error?: string | null,
) {
  session.summary.status = status;
  session.summary.error = error ?? null;
  touchSession(session);
}

function finalizeReplaySession(
  session: RuntimeReplaySession,
  status: "COMPLETED" | "FAILED",
  options?: {
    reason?: string | null;
    failingStepId?: string | null;
  },
) {
  const currentUrl =
    session.page && !session.page.isClosed()
      ? session.page.url()
      : session.summary.currentUrl;
  const lastReplayedAt = new Date().toISOString();

  session.summary.status = status;
  session.summary.error = options?.reason ?? null;
  session.summary.failingStepId = options?.failingStepId ?? null;
  session.summary.currentUrl = currentUrl;
  session.summary.lastReplayedAt = lastReplayedAt;
  session.summary.lastReplayResult = {
    status,
    currentUrl,
    reason: options?.reason ?? null,
    failingStepId: options?.failingStepId ?? null,
    completedStepCount: session.summary.completedStepCount,
    totalStepCount: session.summary.stepCount,
  };
  touchSession(session);
}

function getActivePage(session: RuntimeReplaySession) {
  if (!session.page || session.page.isClosed()) {
    throw new Error("Replay browser page is unavailable.");
  }

  return session.page;
}

async function resolveLocator(
  page: Page,
  step: ReplayableStrategyStep,
  intent: "click" | "fill" | "select_option" | "toggle",
) {
  const candidates: Locator[] = [];

  if (step.selector) {
    candidates.push(page.locator(step.selector).first());
  }

  if (step.label) {
    if (intent === "click") {
      candidates.push(page.getByRole("button", { name: step.label }).first());
      candidates.push(page.getByRole("link", { name: step.label }).first());
    }

    candidates.push(page.getByLabel(step.label).first());
    candidates.push(page.getByText(step.label, { exact: false }).first());
  }

  if (step.text && step.text !== step.label) {
    candidates.push(page.getByText(step.text, { exact: false }).first());
  }

  for (const locator of candidates) {
    try {
      await locator.waitFor({
        state: "attached",
        timeout: 1000,
      });
      return locator;
    } catch {
      // Try the next recorded locator candidate.
    }
  }

  throw new Error(
    `Unable to resolve a target for step ${step.id} (${step.type}).`,
  );
}

function getReplayTargetUrl(
  step: ReplayableStrategyStep,
  fallbackUrl: string,
) {
  if (step.type === "goto" && step.text?.startsWith("http")) {
    return step.text;
  }

  if (step.currentUrl) {
    return step.currentUrl;
  }

  if (step.text?.startsWith("http")) {
    return step.text;
  }

  return fallbackUrl;
}

async function replayStep(
  session: RuntimeReplaySession,
  step: PlaywrightStrategyReplayStep,
  fallbackUrl: string,
) {
  updateReplayStep(session, step.id, {
    status: "RUNNING",
    reason: null,
    startedAt: new Date().toISOString(),
  });

  const page = getActivePage(session);

  switch (step.type) {
    case "goto":
    case "navigation": {
      const targetUrl = getReplayTargetUrl(step, fallbackUrl);
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_STEP_TIMEOUT_MS,
      });
      break;
    }
    case "click": {
      const locator = await resolveLocator(page, step, "click");
      await locator.waitFor({
        state: "visible",
        timeout: DEFAULT_STEP_TIMEOUT_MS,
      });
      await locator.click({ timeout: DEFAULT_STEP_TIMEOUT_MS });
      break;
    }
    case "fill": {
      if (step.value === "[REDACTED]") {
        throw new Error(
          "Recorded secret values are redacted and cannot be replayed automatically.",
        );
      }

      const locator = await resolveLocator(page, step, "fill");
      await locator.waitFor({
        state: "visible",
        timeout: DEFAULT_STEP_TIMEOUT_MS,
      });
      await locator.fill(step.value ?? "", {
        timeout: DEFAULT_STEP_TIMEOUT_MS,
      });
      break;
    }
    case "select_option": {
      const locator = await resolveLocator(page, step, "select_option");
      await locator.waitFor({
        state: "visible",
        timeout: DEFAULT_STEP_TIMEOUT_MS,
      });

      if (step.value) {
        await locator.selectOption({ value: step.value });
      } else if (step.text) {
        await locator.selectOption({ label: step.text });
      } else {
        throw new Error(
          "Recorded select step is missing an option value or label.",
        );
      }
      break;
    }
    case "toggle": {
      const locator = await resolveLocator(page, step, "toggle");
      await locator.waitFor({
        state: "visible",
        timeout: DEFAULT_STEP_TIMEOUT_MS,
      });

      if (step.checked === false) {
        await locator.uncheck({ timeout: DEFAULT_STEP_TIMEOUT_MS });
      } else {
        await locator.check({ timeout: DEFAULT_STEP_TIMEOUT_MS });
      }
      break;
    }
    default:
      throw new Error(`Unsupported replay step type: ${step.type}`);
  }

  await page.waitForTimeout(350).catch(() => undefined);
  const currentUrl =
    session.page && !session.page.isClosed() ? session.page.url() : page.url();
  setCurrentUrl(session, currentUrl);

  updateReplayStep(session, step.id, {
    status: "COMPLETED",
    completedAt: new Date().toISOString(),
  });

  console.info("[TEACH_MODE_REPLAY] completed step", {
    sessionId: session.summary.id,
    hostname: session.summary.hostname,
    stepId: step.id,
    type: step.type,
    currentUrl,
  });
}

async function runReplaySession(
  session: RuntimeReplaySession,
  args: {
    startUrl: string;
  },
) {
  try {
    markReplaySessionStatus(session, "RUNNING");

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    session.browser = browser;
    session.context = context;
    session.page = page;

    const wirePage = (activePage: Page) => {
      session.page = activePage;

      activePage.on("framenavigated", (frame) => {
        if (frame === activePage.mainFrame()) {
          setCurrentUrl(session, frame.url());
        }
      });

      activePage.on("close", () => {
        if (
          session.summary.status === "RUNNING" ||
          session.summary.status === "STARTING"
        ) {
          finalizeReplaySession(session, "FAILED", {
            reason: "Replay browser was closed before the strategy finished.",
            failingStepId: session.summary.failingStepId ?? null,
          });
        }
      });
    };

    wirePage(page);
    context.on("page", (nextPage) => {
      wirePage(nextPage);
    });

    browser.on("disconnected", () => {
      if (
        session.summary.status === "RUNNING" ||
        session.summary.status === "STARTING"
      ) {
        finalizeReplaySession(session, "FAILED", {
          reason: "Replay browser disconnected before the strategy finished.",
          failingStepId: session.summary.failingStepId ?? null,
        });
      }
    });

    await page.goto(args.startUrl, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_STEP_TIMEOUT_MS,
    });
    await page.waitForTimeout(500).catch(() => undefined);
    setCurrentUrl(session, page.url());

    console.info("[TEACH_MODE_REPLAY] started replay session", {
      sessionId: session.summary.id,
      hostname: session.summary.hostname,
      startUrl: args.startUrl,
      stepCount: session.summary.stepCount,
    });

    for (const step of session.summary.steps) {
      try {
        await replayStep(session, step, args.startUrl);
      } catch (error) {
        const reason =
          error instanceof Error
            ? error.message
            : `Replay failed on step ${step.id}.`;

        updateReplayStep(session, step.id, {
          status: "FAILED",
          reason,
          completedAt: new Date().toISOString(),
        });

        session.summary.failingStepId = step.id;
        finalizeReplaySession(session, "FAILED", {
          reason,
          failingStepId: step.id,
        });

        console.error("[TEACH_MODE_REPLAY] replay failed", {
          sessionId: session.summary.id,
          hostname: session.summary.hostname,
          stepId: step.id,
          reason,
          currentUrl: session.summary.currentUrl,
        });

        return;
      }
    }

    finalizeReplaySession(session, "COMPLETED");

    console.info("[TEACH_MODE_REPLAY] replay completed", {
      sessionId: session.summary.id,
      hostname: session.summary.hostname,
      currentUrl: session.summary.currentUrl,
      completedStepCount: session.summary.completedStepCount,
    });
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unable to start strategy replay.";
    finalizeReplaySession(session, "FAILED", {
      reason,
      failingStepId: session.summary.failingStepId ?? null,
    });
  }
}

export function startPlaywrightStrategyReplaySession(args: {
  hostname: string;
  startUrl: string;
  finalUrl: string;
  stopReason: string;
  lastAction: string;
  steps: ReplayableStrategyStep[];
}) {
  const sessionId = makeReplaySessionId();
  const now = new Date().toISOString();
  const summary: PlaywrightStrategyReplaySessionSummary = {
    id: sessionId,
    hostname: args.hostname,
    startUrl: args.startUrl,
    finalUrl: args.finalUrl,
    stopReason: args.stopReason,
    lastAction: args.lastAction,
    status: "STARTING",
    startedAt: now,
    updatedAt: now,
    currentUrl: null,
    stepCount: args.steps.length,
    completedStepCount: 0,
    failingStepId: null,
    error: null,
    lastReplayedAt: null,
    lastReplayResult: null,
    steps: args.steps.map((step) => ({
      ...step,
      status: "PENDING",
      reason: null,
      startedAt: null,
      completedAt: null,
    })),
  };

  const runtimeSession: RuntimeReplaySession = {
    summary,
  };

  getReplayStore().set(sessionId, runtimeSession);
  void runReplaySession(runtimeSession, {
    startUrl: args.startUrl,
  });

  return asSummary(runtimeSession);
}

export function getPlaywrightStrategyReplaySession(sessionId: string) {
  const session = getReplayStore().get(sessionId);
  return session ? asSummary(session) : null;
}
