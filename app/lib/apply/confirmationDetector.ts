import type { BrowserContext, Locator, Page } from "playwright-core";

const SUBMISSION_CONFIRMATION_URL_PATTERN =
  /(?:\/confirmation(?:[/?#]|$)|\/thank(?:[-_a-z0-9]*)?(?:[/?#]|$)|\/submitted(?:[/?#]|$)|application[-_]?submitted|submission[-_]?confirmed|success)/i;

const SUBMISSION_CONFIRMATION_TEXT_PATTERN =
  /\b(thank you|thank you for applying|thanks for applying|application submitted|submitted successfully|we have received|we received your application|your application has been received|your application has been submitted)\b/i;

export type SubmissionConfirmationMatch = {
  confirmed: boolean;
  finalUrl: string;
  pageTextSnippet?: string;
  matchedBy?: "url" | "text" | "popup" | "context-page";
  popupUrl?: string | null;
};

export type GreenhouseSubmissionConfirmationResult = {
  confirmed: boolean;
  confirmationUrl?: string | null;
  confirmationSource:
    | "popup_url"
    | "same_tab_url"
    | "popup_text"
    | "same_tab_text"
    | "network_response"
    | "unknown";
  reason: string;
  pageTextSnippet?: string;
  popupUrl?: string | null;
};

export type SubmitAndDetectGreenhouseConfirmationResult = {
  submitClicked: boolean;
  submissionConfirmed: boolean;
  confirmationUrl: string | null;
  popupUrl: string | null;
  sameTabUrl: string | null;
  confirmationSource:
    | "popup_url"
    | "same_tab_url"
    | "popup_text"
    | "same_tab_text"
    | "network_response"
    | "unknown";
  reason: string;
};

export function isSubmissionConfirmationUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    return SUBMISSION_CONFIRMATION_URL_PATTERN.test(
      `${parsed.pathname}${parsed.search}${parsed.hash}`,
    );
  } catch {
    return SUBMISSION_CONFIRMATION_URL_PATTERN.test(rawUrl);
  }
}

export function isSubmissionConfirmationText(text: string | null | undefined) {
  return SUBMISSION_CONFIRMATION_TEXT_PATTERN.test(text ?? "");
}

function extractSubmissionConfirmationSnippet(text: string) {
  const source = text.replace(/\s+/g, " ").trim();
  if (!source) return undefined;
  const match = SUBMISSION_CONFIRMATION_TEXT_PATTERN.exec(source);
  if (!match || match.index < 0) return source.slice(0, 220);
  const start = Math.max(0, match.index - 70);
  const end = Math.min(source.length, match.index + match[0].length + 150);
  return source.slice(start, end).trim();
}

async function inspectSubmissionConfirmationPage(args: {
  page: Page;
  currentPage: Page;
  targetUrl: string;
}): Promise<SubmissionConfirmationMatch | null> {
  const page = args.page;
  await page.waitForLoadState("domcontentloaded", { timeout: 2_500 }).catch(
    () => undefined,
  );
  const finalUrl = page.url() || args.targetUrl;
  const isCurrentPage = page === args.currentPage;
  const opener = isCurrentPage ? null : await page.opener().catch(() => null);
  const nonCurrentMatchedBy = opener === args.currentPage ? "popup" : "context-page";

  if (isSubmissionConfirmationUrl(finalUrl)) {
    return {
      confirmed: true,
      finalUrl,
      matchedBy: isCurrentPage ? "url" : nonCurrentMatchedBy,
      popupUrl: isCurrentPage ? null : finalUrl,
    };
  }

  const pageText = await page.locator("body").innerText({ timeout: 2_000 }).catch(
    () => "",
  );
  if (isSubmissionConfirmationText(pageText)) {
    return {
      confirmed: true,
      finalUrl,
      pageTextSnippet: extractSubmissionConfirmationSnippet(pageText),
      matchedBy: isCurrentPage ? "text" : nonCurrentMatchedBy,
      popupUrl: isCurrentPage ? null : finalUrl,
    };
  }

  return null;
}

async function readConfirmationTextMatch(page: Page) {
  const text = await page.locator("body").innerText({ timeout: 2_000 }).catch(
    () => "",
  );
  return isSubmissionConfirmationText(text)
    ? extractSubmissionConfirmationSnippet(text)
    : null;
}

function uniquePages(pages: Array<Page | null | undefined>) {
  const seen = new Set<Page>();
  const result: Page[] = [];
  for (const page of pages) {
    if (!page || seen.has(page)) continue;
    seen.add(page);
    result.push(page);
  }
  return result;
}

export async function detectSubmissionConfirmationAcrossPages(
  context: BrowserContext,
  currentPage: Page,
  targetUrl: string,
  observedPages: Array<Page | null | undefined> = [],
): Promise<SubmissionConfirmationMatch> {
  const pages = uniquePages([
    ...observedPages,
    currentPage,
    ...context.pages().filter((candidate) => candidate !== currentPage),
  ]);

  for (const page of pages) {
    const match = await inspectSubmissionConfirmationPage({
      page,
      currentPage,
      targetUrl,
    }).catch(() => null);
    if (match) return match;
  }

  return {
    confirmed: false,
    finalUrl: currentPage.url() || targetUrl,
  };
}

export async function detectGreenhouseSubmissionConfirmation(args: {
  context: BrowserContext;
  page: Page;
  popupPage?: Page | null;
  observedPages?: Array<Page | null | undefined>;
  provider?: string | null;
  expectedGreenhouseToken?: string | null;
  targetUrl: string;
}): Promise<GreenhouseSubmissionConfirmationResult> {
  const match = await detectSubmissionConfirmationAcrossPages(
    args.context,
    args.page,
    args.targetUrl,
    [args.popupPage, ...(args.observedPages ?? [])],
  );

  if (!match.confirmed) {
    return {
      confirmed: false,
      confirmationUrl: null,
      confirmationSource: "unknown",
      reason: "No confirmation URL or confirmation text was detected.",
      popupUrl: match.popupUrl ?? null,
    };
  }

  const isPopup = match.matchedBy === "popup" || match.matchedBy === "context-page";
  const byUrl = isSubmissionConfirmationUrl(match.finalUrl);
  return {
    confirmed: true,
    confirmationUrl: match.finalUrl,
    confirmationSource: byUrl
      ? isPopup
        ? "popup_url"
        : "same_tab_url"
      : isPopup
        ? "popup_text"
        : "same_tab_text",
    reason: byUrl
      ? "A confirmation URL was detected after submit."
      : "Confirmation text was detected after submit.",
    pageTextSnippet: match.pageTextSnippet,
    popupUrl: match.popupUrl ?? (isPopup ? match.finalUrl : null),
  };
}

export async function submitAndDetectGreenhouseConfirmation(args: {
  page: Page;
  submitLocator: Locator;
  provider?: string | null;
  expectedGreenhouseToken?: string | null;
  applicationId?: string | null;
  sessionId?: string | null;
  targetUrl?: string | null;
  timeoutMs?: number;
}): Promise<SubmitAndDetectGreenhouseConfirmationResult> {
  const {
    page,
    submitLocator,
    provider,
    expectedGreenhouseToken,
    applicationId,
    sessionId,
  } = args;
  const timeoutMs = args.timeoutMs ?? 15_000;
  const context = page.context();
  const originalUrl = page.url();
  const logBase = {
    applicationId: applicationId ?? null,
    applySessionId: sessionId ?? null,
    provider: provider ?? null,
    expectedGreenhouseToken: expectedGreenhouseToken ?? null,
    currentUrl: originalUrl,
  };

  console.log("[AUTO_APPLY_SUBMIT] waiting for popup/new-tab confirmation", logBase);
  const contextPagePromise = context
    .waitForEvent("page", { timeout: timeoutMs })
    .catch(() => null);

  console.log("[AUTO_APPLY_SUBMIT] waiting for same-tab navigation", logBase);
  const sameTabNavigationPromise = page
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: timeoutMs })
    .catch(() => null);

  console.log("[AUTO_APPLY_SUBMIT] waiting for confirmation network response", logBase);
  const confirmationResponsePromise = page
    .waitForResponse(
      (response) => {
        const url = response.url();
        const status = response.status();
        return (
          status >= 200 &&
          status < 400 &&
          /greenhouse\.io/i.test(url) &&
          /confirmation/i.test(url)
        );
      },
      { timeout: timeoutMs },
    )
    .catch(() => null);

  let submitClicked = false;
  try {
    await submitLocator.scrollIntoViewIfNeeded().catch(() => undefined);
    await submitLocator.focus().catch(() => undefined);
    await submitLocator.click();
    submitClicked = true;
    console.log("[AUTO_APPLY_SUBMIT] submit clicked", logBase);
  } catch (error) {
    return {
      submitClicked: false,
      submissionConfirmed: false,
      confirmationUrl: null,
      popupUrl: null,
      sameTabUrl: page.url() || originalUrl || null,
      confirmationSource: "unknown",
      reason:
        error instanceof Error
          ? `Submit click failed: ${error.message}`
          : "Submit click failed.",
    };
  }

  const settled = await Promise.allSettled([
    contextPagePromise,
    sameTabNavigationPromise,
    confirmationResponsePromise,
  ]);
  await page.waitForTimeout(Math.min(800, Math.max(0, timeoutMs))).catch(() => undefined);

  const popupPage =
    settled[0].status === "fulfilled" ? settled[0].value : null;
  const confirmationResponse =
    settled[2].status === "fulfilled" ? settled[2].value : null;
  const popupUrl = popupPage && popupPage !== page ? popupPage.url() || null : null;
  const sameTabUrl = page.url() || originalUrl || null;

  if (popupPage && popupPage !== page) {
    console.log("[AUTO_APPLY_CONFIRMATION] popup detected", {
      ...logBase,
      popupUrl,
    });
    await popupPage
      .waitForLoadState("domcontentloaded", { timeout: timeoutMs })
      .catch(() => undefined);
  }

  if (confirmationResponse) {
    const responseUrl = confirmationResponse.url();
    console.log("[AUTO_APPLY_CONFIRMATION] network confirmation response detected", {
      ...logBase,
      confirmationUrl: responseUrl,
    });
    return {
      submitClicked,
      submissionConfirmed: true,
      confirmationUrl: responseUrl,
      popupUrl,
      sameTabUrl,
      confirmationSource: "network_response",
      reason: "A Greenhouse confirmation network response was detected after submit.",
    };
  }

  if (popupPage && popupPage !== page) {
    const checkedPopupUrl = popupPage.url() || popupUrl;
    console.log("[AUTO_APPLY_CONFIRMATION] popup url checked", {
      ...logBase,
      popupUrl: checkedPopupUrl,
    });
    if (isSubmissionConfirmationUrl(checkedPopupUrl)) {
      console.log("[AUTO_APPLY_CONFIRMATION] greenhouse confirmation detected", {
        ...logBase,
        confirmationUrl: checkedPopupUrl,
        confirmationSource: "popup_url",
      });
      return {
        submitClicked,
        submissionConfirmed: true,
        confirmationUrl: checkedPopupUrl,
        popupUrl: checkedPopupUrl,
        sameTabUrl,
        confirmationSource: "popup_url",
        reason: "A Greenhouse confirmation URL opened in a new tab after submit.",
      };
    }

    const popupTextSnippet = await readConfirmationTextMatch(popupPage);
    console.log("[AUTO_APPLY_CONFIRMATION] popup text checked", {
      ...logBase,
      popupUrl: checkedPopupUrl,
      confirmationTextFound: Boolean(popupTextSnippet),
    });
    if (popupTextSnippet) {
      console.log("[AUTO_APPLY_CONFIRMATION] greenhouse confirmation detected", {
        ...logBase,
        confirmationUrl: checkedPopupUrl,
        confirmationSource: "popup_text",
      });
      return {
        submitClicked,
        submissionConfirmed: true,
        confirmationUrl: checkedPopupUrl,
        popupUrl: checkedPopupUrl,
        sameTabUrl,
        confirmationSource: "popup_text",
        reason: "Greenhouse confirmation text opened in a new tab after submit.",
      };
    }
  }

  console.log("[AUTO_APPLY_CONFIRMATION] same-tab url checked", {
    ...logBase,
    sameTabUrl,
  });
  if (isSubmissionConfirmationUrl(sameTabUrl)) {
    console.log("[AUTO_APPLY_CONFIRMATION] greenhouse confirmation detected", {
      ...logBase,
      confirmationUrl: sameTabUrl,
      confirmationSource: "same_tab_url",
    });
    return {
      submitClicked,
      submissionConfirmed: true,
      confirmationUrl: sameTabUrl,
      popupUrl,
      sameTabUrl,
      confirmationSource: "same_tab_url",
      reason: "The current page navigated to a Greenhouse confirmation URL.",
    };
  }

  const sameTabTextSnippet = await readConfirmationTextMatch(page);
  console.log("[AUTO_APPLY_CONFIRMATION] same-tab text checked", {
    ...logBase,
    sameTabUrl,
    confirmationTextFound: Boolean(sameTabTextSnippet),
  });
  if (sameTabTextSnippet) {
    console.log("[AUTO_APPLY_CONFIRMATION] greenhouse confirmation detected", {
      ...logBase,
      confirmationUrl: sameTabUrl,
      confirmationSource: "same_tab_text",
    });
    return {
      submitClicked,
      submissionConfirmed: true,
      confirmationUrl: sameTabUrl,
      popupUrl,
      sameTabUrl,
      confirmationSource: "same_tab_text",
      reason: "The current page showed Greenhouse confirmation text.",
    };
  }

  const observedPages = context.pages();
  console.log("[AUTO_APPLY_CONFIRMATION] context pages inspected", {
    ...logBase,
    pageCount: observedPages.length,
  });
  const contextMatch = await detectSubmissionConfirmationAcrossPages(
    context,
    page,
    args.targetUrl ?? originalUrl,
    popupPage ? [popupPage] : [],
  );
  if (contextMatch.confirmed) {
    const source =
      contextMatch.matchedBy === "popup" || contextMatch.matchedBy === "context-page"
        ? isSubmissionConfirmationUrl(contextMatch.finalUrl)
          ? "popup_url"
          : "popup_text"
        : isSubmissionConfirmationUrl(contextMatch.finalUrl)
          ? "same_tab_url"
          : "same_tab_text";
    console.log("[AUTO_APPLY_CONFIRMATION] greenhouse confirmation detected", {
      ...logBase,
      confirmationUrl: contextMatch.finalUrl,
      confirmationSource: source,
    });
    return {
      submitClicked,
      submissionConfirmed: true,
      confirmationUrl: contextMatch.finalUrl,
      popupUrl: contextMatch.popupUrl ?? popupUrl,
      sameTabUrl,
      confirmationSource: source,
      reason: "A Greenhouse confirmation page was found in the browser context.",
    };
  }

  console.log("[AUTO_APPLY_CONFIRMATION] confirmation not detected after submit", {
    ...logBase,
    popupUrl,
    sameTabUrl,
  });
  return {
    submitClicked,
    submissionConfirmed: false,
    confirmationUrl: null,
    popupUrl,
    sameTabUrl,
    confirmationSource: "unknown",
    reason: "No Greenhouse confirmation URL, text, or network response was detected after submit.",
  };
}
