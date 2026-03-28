// File: /Hirexa/my-app/tests/public-signup-otp-onboarding.spec.ts
import { expect, test, type Page } from "@playwright/test";
import { buildFreshMailosaurEmail, waitForOtpCode } from "./helpers/mailosaur";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function completeProfileIfVisible(page: Page, email: string) {
  const firstName = page.getByTestId("profile-first-name");
  if (!(await firstName.isVisible().catch(() => false))) {
    return;
  }

  await firstName.fill("Playwright");
  await page.getByTestId("profile-last-name").fill("Smoke");
  await page.getByTestId("profile-phone").fill("(555) 123-4567");
  await page.getByTestId("profile-email").fill(email);
  await page.getByTestId("profile-address").fill("123 Test Street");
  await page.getByTestId("profile-city").fill("Boston");
  await page.getByTestId("profile-state").selectOption({ label: "Massachusetts" });
  await page.getByTestId("profile-postal-code").fill("02108");
  await page.getByTestId("profile-linkedin").fill("https://www.linkedin.com/in/playwright-smoke");
  await page.getByTestId("profile-continue").click();
  await page.waitForURL((url) => url.pathname !== "/onboarding/profile", {
    timeout: 30_000,
  });
}

async function completeQuestionsIfVisible(page: Page) {
  const authorizedSelect = page.getByTestId("question-authorizedUS");
  if (!(await authorizedSelect.isVisible().catch(() => false))) {
    return;
  }

  await authorizedSelect.selectOption({
    label: "Yes, I am authorized to work in the United States",
  });
  await page.getByTestId("question-sponsorship").selectOption({
    label: "No, I do not require sponsorship",
  });

  const felonyField = page.getByTestId("question-felony");
  if (await felonyField.isVisible().catch(() => false)) {
    await felonyField.selectOption({ label: "Prefer not to say" }).catch(() => {
      // The current page no longer renders a visible felony select in all flows.
    });
  }

  await page.getByTestId("questions-next").click();
  await page.waitForURL(
    (url) => !/(\/questionsClients|\/questions)(\/|$)/.test(url.pathname),
    {
      timeout: 30_000,
    }
  );
}

async function waitForAuthenticatedRoute(page: Page) {
  await page.waitForURL(
    (url) => {
      const pathname = url.pathname;
      return [
        "/dashboard",
        "/onboarding/profile",
        "/questions",
        "/questionsClients",
        "/resume",
      ].some((route) => pathname.startsWith(route));
    },
    { timeout: 90_000 }
  );
}

test("public signup -> OTP -> post-auth onboarding smoke", async ({ page }) => {
  test.slow();

  const password = requireEnv("E2E_PASSWORD");
  const email = buildFreshMailosaurEmail("public-signup");

  await page.goto("/onboarding/account");
  await expect(page).toHaveURL(/\/onboarding\/account/);
  await expect(page.getByText("Create account")).toBeVisible();

  await page.getByLabel("First name").fill("Playwright");
  await page.getByLabel("Last name").fill("Smoke");
  await page.getByTestId("signup-email").fill(email);
  await page.getByTestId("signup-password").fill(password);
  await page.getByTestId("signup-confirm-password").fill(password);

  await expect(page.getByTestId("signup-continue")).toBeEnabled();
  await page.getByTestId("signup-continue").click();

  await expect(
    page.getByText(/6-digit verification code/i)
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("otp-submit")).toBeVisible();

  const otpCode = await waitForOtpCode(email, 60_000);
  await page.getByTestId("otp-input").fill(otpCode);
  await page.getByTestId("otp-submit").click();

  await waitForAuthenticatedRoute(page);

  if (page.url().includes("/onboarding/profile")) {
    await completeProfileIfVisible(page, email);
  }

  if (/(\/questionsClients|\/questions)(\/|$)/.test(new URL(page.url()).pathname)) {
    await completeQuestionsIfVisible(page);
  }

  await expect(page).not.toHaveURL(/\/(login|onboarding\/account)(\/|$)/);
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
    .toMatch(
      /^\/(dashboard|resume|questionsClients|questions|onboarding\/profile|onboarding\/job-interest|benefits)(\/.*)?$/
    );
});
