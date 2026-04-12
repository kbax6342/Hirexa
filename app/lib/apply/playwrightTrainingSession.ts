import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export type PlaywrightTrainingStep = {
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

export type PlaywrightTrainingSessionSummary = {
  id: string;
  hostname: string;
  finalUrl: string;
  stopReason: string;
  lastAction: string;
  status: "RECORDING" | "STOPPED" | "FAILED";
  startedAt: string;
  updatedAt: string;
  currentUrl: string | null;
  stepCount: number;
  steps: PlaywrightTrainingStep[];
  error?: string | null;
};

type RuntimeSession = {
  summary: PlaywrightTrainingSessionSummary;
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  lastNavigationUrl?: string | null;
  navigationCaptureEnabled?: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __hirexaPlaywrightTrainingSessions:
    | Map<string, RuntimeSession>
    | undefined;
}

function getTrainingStore() {
  if (!globalThis.__hirexaPlaywrightTrainingSessions) {
    globalThis.__hirexaPlaywrightTrainingSessions = new Map();
  }

  return globalThis.__hirexaPlaywrightTrainingSessions;
}

function makeTrainingSessionId() {
  return `teach_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeTrainingStepId() {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function asSummary(session: RuntimeSession): PlaywrightTrainingSessionSummary {
  return {
    ...session.summary,
    steps: [...session.summary.steps],
  };
}

function touchSession(session: RuntimeSession) {
  session.summary.updatedAt = new Date().toISOString();
}

function recordStep(
  session: RuntimeSession,
  step: Omit<PlaywrightTrainingStep, "id" | "timestamp"> & {
    timestamp?: string;
  },
) {
  const nextStep: PlaywrightTrainingStep = {
    id: makeTrainingStepId(),
    timestamp: step.timestamp ?? new Date().toISOString(),
    ...step,
  };

  session.summary.steps = [...session.summary.steps, nextStep];
  session.summary.stepCount = session.summary.steps.length;
  session.summary.currentUrl = nextStep.currentUrl;
  touchSession(session);

  console.info("[TEACH_MODE] recorded training step", {
    sessionId: session.summary.id,
    hostname: session.summary.hostname,
    type: nextStep.type,
    selector: nextStep.selector ?? null,
    currentUrl: nextStep.currentUrl,
  });
}

function markSessionStatus(
  session: RuntimeSession,
  status: PlaywrightTrainingSessionSummary["status"],
  error?: string | null,
) {
  session.summary.status = status;
  session.summary.error = error ?? null;
  touchSession(session);
}

export async function startPlaywrightTrainingSession(args: {
  hostname: string;
  finalUrl: string;
  stopReason: string;
  lastAction: string;
}) {
  const sessionId = makeTrainingSessionId();
  const now = new Date().toISOString();
  const summary: PlaywrightTrainingSessionSummary = {
    id: sessionId,
    hostname: args.hostname,
    finalUrl: args.finalUrl,
    stopReason: args.stopReason,
    lastAction: args.lastAction,
    status: "RECORDING",
    startedAt: now,
    updatedAt: now,
    currentUrl: null,
    stepCount: 0,
    steps: [],
    error: null,
  };

  const store = getTrainingStore();
  const runtimeSession: RuntimeSession = {
    summary,
    lastNavigationUrl: null,
    navigationCaptureEnabled: false,
  };
  store.set(sessionId, runtimeSession);

  try {
    const browser = await chromium.launch({
      headless: false,
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    runtimeSession.browser = browser;
    runtimeSession.context = context;
    runtimeSession.page = page;

    await context.exposeBinding(
      "__hirexaRecordTrainingAction",
      async (source, action: Partial<PlaywrightTrainingStep>) => {
        const boundPage = source.page ?? runtimeSession.page;
        const currentUrl = boundPage?.url() ?? runtimeSession.summary.currentUrl ?? args.finalUrl;

        if (boundPage) {
          await boundPage
            .waitForTimeout(action.type === "click" ? 150 : 50)
            .catch(() => undefined);
        }

        recordStep(runtimeSession, {
          type:
            action.type === "goto" ||
            action.type === "navigation" ||
            action.type === "click" ||
            action.type === "fill" ||
            action.type === "select_option" ||
            action.type === "toggle"
              ? action.type
              : "click",
          selector: action.selector ?? undefined,
          label: action.label ?? undefined,
          text: action.text ?? undefined,
          value: action.value ?? undefined,
          checked: action.checked,
          currentUrl,
        });
      },
    );

    await context.addInitScript(() => {
      if ((window as Record<string, unknown>).__hirexaTeachRecorderInstalled) {
        return;
      }

      (window as Record<string, unknown>).__hirexaTeachRecorderInstalled = true;

      const normalizeText = (value: string | null | undefined) =>
        String(value ?? "").replace(/\s+/g, " ").trim();

      const cssEscape =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape.bind(CSS)
          : (value: string) => value.replace(/([^\w-])/g, "\\$1");

      const buildSelector = (element: Element) => {
        if (!(element instanceof HTMLElement)) {
          return element.tagName.toLowerCase();
        }

        const testId = element.getAttribute("data-testid");
        if (testId) return `[data-testid="${cssEscape(testId)}"]`;

        if (element.id) return `#${cssEscape(element.id)}`;

        const name = element.getAttribute("name");
        if (name) {
          return `${element.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
        }

        const ariaLabel = element.getAttribute("aria-label");
        if (ariaLabel) {
          return `${element.tagName.toLowerCase()}[aria-label="${cssEscape(ariaLabel)}"]`;
        }

        const segments: string[] = [];
        let current: Element | null = element;

        while (current && current instanceof HTMLElement) {
          const tagName = current.tagName.toLowerCase();
          const parent = current.parentElement;
          if (!parent) {
            segments.unshift(tagName);
            break;
          }

          const siblings = Array.from(parent.children).filter(
            (child) => child.tagName === current?.tagName,
          );
          const index = siblings.indexOf(current) + 1;
          segments.unshift(`${tagName}:nth-of-type(${index})`);
          current = parent;
        }

        return segments.join(" > ");
      };

      const readLabel = (element: HTMLElement) => {
        const ariaLabel = normalizeText(element.getAttribute("aria-label"));
        if (ariaLabel) return ariaLabel;

        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        ) {
          if (element.id) {
            const explicitLabel = document.querySelector(`label[for="${cssEscape(element.id)}"]`);
            if (explicitLabel instanceof HTMLElement) {
              const text = normalizeText(explicitLabel.innerText);
              if (text) return text;
            }
          }

          const wrappingLabel = element.closest("label");
          if (wrappingLabel instanceof HTMLElement) {
            const text = normalizeText(wrappingLabel.innerText);
            if (text) return text;
          }

          const placeholder =
            "placeholder" in element ? normalizeText(element.placeholder) : "";
          if (placeholder) return placeholder;

          const name = normalizeText(element.getAttribute("name"));
          if (name) return name;
        }

        const title = normalizeText(element.getAttribute("title"));
        if (title) return title;

        return normalizeText(element.innerText);
      };

      const readText = (element: HTMLElement) => {
        if (element instanceof HTMLSelectElement) {
          const selectedOption = element.selectedOptions[0];
          return normalizeText(selectedOption?.textContent);
        }

        if (
          element instanceof HTMLInputElement &&
          (element.type === "button" || element.type === "submit")
        ) {
          return normalizeText(element.value);
        }

        return normalizeText(element.innerText || element.textContent);
      };

      const describeElement = (element: HTMLElement) => {
        const description: Record<string, unknown> = {
          selector: buildSelector(element),
          label: readLabel(element) || undefined,
          text: readText(element) || undefined,
        };

        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          description.value =
            element instanceof HTMLInputElement && element.type === "password"
              ? "[REDACTED]"
              : String(element.value ?? "");
        }

        if (element instanceof HTMLSelectElement) {
          description.value = String(element.value ?? "");
        }

        if (element instanceof HTMLInputElement) {
          if (element.type === "checkbox" || element.type === "radio") {
            description.checked = element.checked;
          }
        }

        return description;
      };

      const emitAction = (type: string, element: HTMLElement) => {
        try {
          const payload = {
            type,
            ...describeElement(element),
          };
          const recorder = (window as Record<string, unknown>)
            .__hirexaRecordTrainingAction as
            | ((step: Record<string, unknown>) => Promise<void>)
            | undefined;
          void recorder?.(payload);
        } catch {
          // Ignore recording errors in the page.
        }
      };

      document.addEventListener(
        "click",
        (event) => {
          const rawTarget =
            event.target instanceof Element
              ? event.target.closest(
                  "a, button, input, textarea, select, label, [role='button']",
                )
              : null;
          if (!(rawTarget instanceof HTMLElement)) return;

          if (
            rawTarget instanceof HTMLInputElement &&
            (rawTarget.type === "checkbox" || rawTarget.type === "radio")
          ) {
            return;
          }

          if (rawTarget instanceof HTMLSelectElement) {
            return;
          }

          emitAction("click", rawTarget);
        },
        true,
      );

      document.addEventListener(
        "change",
        (event) => {
          const rawTarget = event.target;
          if (!(rawTarget instanceof HTMLElement)) return;

          if (rawTarget instanceof HTMLSelectElement) {
            emitAction("select_option", rawTarget);
            return;
          }

          if (
            rawTarget instanceof HTMLInputElement &&
            (rawTarget.type === "checkbox" || rawTarget.type === "radio")
          ) {
            emitAction("toggle", rawTarget);
            return;
          }

          if (
            rawTarget instanceof HTMLInputElement ||
            rawTarget instanceof HTMLTextAreaElement
          ) {
            emitAction("fill", rawTarget);
          }
        },
        true,
      );
    });

    const wirePage = (activePage: Page) => {
      runtimeSession.page = activePage;

      activePage.on("close", () => {
        if (runtimeSession.summary.status === "RECORDING") {
          markSessionStatus(runtimeSession, "STOPPED");
        }
      });

      activePage.on("framenavigated", (frame) => {
        if (frame !== activePage.mainFrame()) return;
        if (!runtimeSession.navigationCaptureEnabled) return;

        const nextUrl = frame.url();
        if (!nextUrl || nextUrl === runtimeSession.lastNavigationUrl) {
          return;
        }

        runtimeSession.lastNavigationUrl = nextUrl;
        recordStep(runtimeSession, {
          type: "navigation",
          selector: "navigation",
          label: "Navigation",
          text: nextUrl,
          currentUrl: nextUrl,
        });
      });
    };

    wirePage(page);
    context.on("page", (nextPage) => {
      wirePage(nextPage);
    });

    await page.goto(args.finalUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);

    runtimeSession.summary.currentUrl = page.url();
    runtimeSession.lastNavigationUrl = page.url();
    recordStep(runtimeSession, {
      type: "goto",
      selector: "page.goto",
      label: "Initial training page",
      text: args.finalUrl,
      currentUrl: page.url(),
    });
    runtimeSession.navigationCaptureEnabled = true;

    browser.on("disconnected", () => {
      if (runtimeSession.summary.status === "RECORDING") {
        markSessionStatus(runtimeSession, "STOPPED");
      }
    });

    console.info("[TEACH_MODE] started training session", {
      sessionId,
      hostname: args.hostname,
      finalUrl: args.finalUrl,
      stopReason: args.stopReason,
      lastAction: args.lastAction,
    });

    return asSummary(runtimeSession);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start training session.";
    markSessionStatus(runtimeSession, "FAILED", message);
    await runtimeSession.context?.close().catch(() => undefined);
    await runtimeSession.browser?.close().catch(() => undefined);
    throw new Error(message);
  }
}

export function getPlaywrightTrainingSession(sessionId: string) {
  const session = getTrainingStore().get(sessionId);
  return session ? asSummary(session) : null;
}

export async function stopPlaywrightTrainingSession(sessionId: string) {
  const session = getTrainingStore().get(sessionId);
  if (!session) return null;

  if (session.summary.status === "RECORDING") {
    markSessionStatus(session, "STOPPED");
  }

  if (session.page && !session.page.isClosed()) {
    session.summary.currentUrl = session.page.url();
  }

  await session.context?.close().catch(() => undefined);
  await session.browser?.close().catch(() => undefined);
  session.context = undefined;
  session.browser = undefined;
  session.page = undefined;

  console.info("[TEACH_MODE] stopped training session", {
    sessionId,
    hostname: session.summary.hostname,
    stepCount: session.summary.stepCount,
    currentUrl: session.summary.currentUrl,
  });

  return asSummary(session);
}
