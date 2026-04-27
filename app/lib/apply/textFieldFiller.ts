import type { Locator } from "playwright-core";

export type TextLikeFieldFillResult = {
  filled: boolean;
  method: "playwright" | "paste" | "dom" | null;
  valueLength: number;
};

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function readTextLikeValue(locator: Locator) {
  const inputValue = await locator.inputValue({ timeout: 1_000 }).catch(() => null);
  if (inputValue !== null) return inputValue;

  return locator
    .evaluate((element) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value ?? "";
      }
      if (element instanceof HTMLElement && element.isContentEditable) {
        return element.innerText?.trim() || element.textContent?.trim() || "";
      }
      if (element instanceof HTMLElement) {
        return element.textContent?.trim() || "";
      }
      return "";
    })
    .catch(() => "");
}

async function dispatchTextCommitEvents(locator: Locator) {
  await locator
    .dispatchEvent("input")
    .catch(() => undefined);
  await locator
    .dispatchEvent("change")
    .catch(() => undefined);
  await locator.blur().catch(() => undefined);
}

async function verifyTextValue(locator: Locator) {
  return text(await readTextLikeValue(locator));
}

export async function fillTextLikeField(args: {
  locator: Locator;
  answer: string;
  label: string;
  fieldType?: string | null;
  applicationId?: string | null;
  sessionId?: string | null;
}): Promise<TextLikeFieldFillResult> {
  const { locator, answer, label } = args;
  const answerLength = answer.length;
  const baseLog = {
    applicationId: args.applicationId ?? null,
    sessionId: args.sessionId ?? null,
    label,
    fieldType: args.fieldType ?? null,
    answerLength,
  };

  console.log("[AUTO_APPLY_TEXT_FILL] attempting textarea fill", baseLog);

  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.focus().catch(() => undefined);
  await locator.fill(answer).catch(() => undefined);
  await dispatchTextCommitEvents(locator);
  let value = await verifyTextValue(locator);
  if (value.length > 0) {
    console.log("[AUTO_APPLY_TEXT_FILL] playwright fill succeeded", {
      ...baseLog,
      method: "playwright",
      valueLength: value.length,
    });
    console.log("[AUTO_APPLY_TEXT_FILL] verified value inserted", {
      ...baseLog,
      method: "playwright",
      valueLength: value.length,
    });
    return { filled: true, method: "playwright", valueLength: value.length };
  }

  console.log("[AUTO_APPLY_TEXT_FILL] paste fallback attempted", {
    ...baseLog,
    valueLength: 0,
  });
  await locator.focus().catch(() => undefined);
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(
    () => undefined,
  );
  await locator.press("Backspace").catch(() => undefined);
  await locator
    .evaluate((element, valueToPaste) => {
      void navigator.clipboard?.writeText?.(valueToPaste).catch(() => undefined);
      if (element instanceof HTMLElement) element.focus();
    }, answer)
    .catch(() => undefined);
  await locator.press(process.platform === "darwin" ? "Meta+V" : "Control+V").catch(
    () => undefined,
  );
  await dispatchTextCommitEvents(locator);
  value = await verifyTextValue(locator);
  if (value.length > 0) {
    console.log("[AUTO_APPLY_TEXT_FILL] verified value inserted", {
      ...baseLog,
      method: "paste",
      valueLength: value.length,
    });
    return { filled: true, method: "paste", valueLength: value.length };
  }

  console.log("[AUTO_APPLY_TEXT_FILL] dom fallback attempted", {
    ...baseLog,
    valueLength: 0,
  });
  await locator
    .evaluate((element, nextValue) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value = nextValue;
      } else if (element instanceof HTMLElement) {
        element.textContent = nextValue;
      }

      const inputEvent =
        typeof InputEvent === "function"
          ? new InputEvent("input", {
              bubbles: true,
              inputType: "insertText",
              data: nextValue,
            })
          : new Event("input", { bubbles: true });
      element.dispatchEvent(inputEvent);
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
      if (element instanceof HTMLElement) element.blur();
    }, answer)
    .catch(() => undefined);
  value = await verifyTextValue(locator);
  if (value.length > 0) {
    console.log("[AUTO_APPLY_TEXT_FILL] verified value inserted", {
      ...baseLog,
      method: "dom",
      valueLength: value.length,
    });
    return { filled: true, method: "dom", valueLength: value.length };
  }

  console.log("[AUTO_APPLY_TEXT_FILL] value still empty after all strategies", {
    ...baseLog,
    method: null,
    valueLength: 0,
  });
  return { filled: false, method: null, valueLength: 0 };
}
