import { expect, test } from "@playwright/test";
import {
  detectSubmissionConfirmationAcrossPages,
  isSubmissionConfirmationText,
  isSubmissionConfirmationUrl,
} from "@/app/lib/apply/playwrightApply";
import { submitAndDetectGreenhouseConfirmation } from "@/app/lib/apply/confirmationDetector";
import { extractGreenhouseValidationErrors } from "@/app/lib/apply/greenhouseValidationErrors";

test("Greenhouse confirmation URL is treated as submitted", () => {
  expect(
    isSubmissionConfirmationUrl(
      "https://job-boards.greenhouse.io/speechify/jobs/5975356004/confirmation",
    ),
  ).toBe(true);
});

test("thank-you body text is treated as submitted", () => {
  expect(isSubmissionConfirmationText("Thank you for applying.")).toBe(true);
});

test("confirmation URL wins even when verification text is also present", async ({
  page,
  context,
}) => {
  await page.route("**/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<main>Verify you are human. Thank you for applying.</main>",
    });
  });
  await page.goto(
    "https://job-boards.greenhouse.io/speechify/jobs/5975356004/confirmation",
  );

  const result = await detectSubmissionConfirmationAcrossPages(
    context,
    page,
    "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
  );

  expect(result.confirmed).toBe(true);
  expect(result.finalUrl).toContain("/confirmation");
  expect(result.matchedBy).toBe("url");
});

test("verification page without confirmation is not treated as submitted", async ({
  page,
  context,
}) => {
  await page.setContent("<main>Verify you are human before continuing.</main>");

  const result = await detectSubmissionConfirmationAcrossPages(
    context,
    page,
    "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
  );

  expect(result.confirmed).toBe(false);
});

test("Greenhouse confirmation popup is treated as submitted", async ({
  page,
  context,
}) => {
  await context.route("https://job-boards.greenhouse.io/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<main>Thank you for applying.</main>",
    });
  });
  await page.setContent(`
    <button id="submit" onclick="window.open('https://job-boards.greenhouse.io/speechify/jobs/5975009004/confirmation', '_blank')">
      Submit Application
    </button>
  `);

  const popupPromise = page.waitForEvent("popup");
  await page.locator("#submit").click();
  const popupPage = await popupPromise;

  const result = await detectSubmissionConfirmationAcrossPages(
    context,
    page,
    "https://job-boards.greenhouse.io/speechify/jobs/5975009004",
    [popupPage],
  );

  expect(result.confirmed).toBe(true);
  expect(result.finalUrl).toContain("/confirmation");
  expect(result.matchedBy).toBe("popup");
});

test("submit helper detects Greenhouse confirmation popup", async ({ page, context }) => {
  await context.route("https://job-boards.greenhouse.io/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<main>Thank you for applying.</main>",
    });
  });
  await page.setContent(`
    <button id="submit" onclick="window.open('https://job-boards.greenhouse.io/speechify/jobs/5975009004/confirmation', '_blank')">
      Submit Application
    </button>
  `);

  const result = await submitAndDetectGreenhouseConfirmation({
    page,
    submitLocator: page.locator("#submit"),
    provider: "greenhouse",
    expectedGreenhouseToken: "5975009004",
    targetUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975009004",
    timeoutMs: 1_000,
  });

  expect(result.submitClicked).toBe(true);
  expect(result.submissionConfirmed).toBe(true);
  expect(result.confirmationUrl).toContain("/confirmation");
  expect(result.confirmationSource).toBe("popup_url");
});

test("submit helper detects Greenhouse confirmation network response", async ({
  page,
}) => {
  await page.route("https://job-boards.greenhouse.io/**/confirmation", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.setContent(`
    <button id="submit" onclick="fetch('https://job-boards.greenhouse.io/speechify/jobs/5975009004/confirmation')">
      Submit Application
    </button>
  `);

  const result = await submitAndDetectGreenhouseConfirmation({
    page,
    submitLocator: page.locator("#submit"),
    provider: "greenhouse",
    expectedGreenhouseToken: "5975009004",
    targetUrl: "https://job-boards.greenhouse.io/speechify/jobs/5975009004",
    timeoutMs: 1_000,
  });

  expect(result.submitClicked).toBe(true);
  expect(result.submissionConfirmed).toBe(true);
  expect(result.confirmationUrl).toContain("/confirmation");
  expect(result.confirmationSource).toBe("network_response");
});

test("Greenhouse validation errors are extracted and mapped to fields", async ({ page }) => {
  await page.setContent(`
    <form>
      <div class="field field_with_errors">
        <label for="question_1">Where are you located?</label>
        <input id="question_1" name="question_1" aria-invalid="true" aria-describedby="question_1_error" />
        <div id="question_1_error" class="field-error">Please select a location.</div>
      </div>
      <div class="field field_with_errors">
        <label for="phone">Phone</label>
        <input id="phone" name="phone" type="tel" aria-invalid="true" />
        <div class="error-message">Enter a valid phone number.</div>
      </div>
    </form>
  `);

  const result = await extractGreenhouseValidationErrors({
    page,
    provider: "greenhouse",
  });

  expect(result.validationErrorCount).toBeGreaterThanOrEqual(2);
  expect(result.errors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        text: "Please select a location.",
        fieldLabel: "Where are you located?",
        category: "invalid_location",
        repairable: true,
      }),
      expect.objectContaining({
        text: "Enter a valid phone number.",
        fieldLabel: "Phone",
        category: "invalid_phone",
        repairable: true,
      }),
    ]),
  );
});

test("Greenhouse recaptcha validation is not repairable", async ({ page }) => {
  await page.setContent(`
    <form>
      <div class="form-error" role="alert">Please complete the reCAPTCHA verification.</div>
    </form>
  `);

  const result = await extractGreenhouseValidationErrors({
    page,
    provider: "greenhouse",
  });

  expect(result.validationErrorCount).toBe(1);
  expect(result.errors[0]).toEqual(
    expect.objectContaining({
      category: "recaptcha_or_security",
      repairable: false,
    }),
  );
});
