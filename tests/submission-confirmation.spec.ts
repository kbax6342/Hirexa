import { expect, test } from "@playwright/test";
import {
  detectSubmissionConfirmationAcrossPages,
  isSubmissionConfirmationText,
  isSubmissionConfirmationUrl,
} from "@/app/lib/apply/playwrightApply";
import { submitAndDetectGreenhouseConfirmation } from "@/app/lib/apply/confirmationDetector";
import { extractGreenhouseValidationErrors } from "@/app/lib/apply/greenhouseValidationErrors";
import { fillGreenhouseReactSelectCountry } from "@/app/lib/apply/locationFieldFiller";

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

test("Greenhouse React Select country validation maps to actionable country error", async ({ page }) => {
  await page.setContent(`
    <form>
      <div class="field field_with_errors">
        <label id="country-label" for="country">Country</label>
        <div class="react-select__control">
          <input
            id="country"
            role="combobox"
            aria-labelledby="country-label"
            aria-describedby="react-select-country-placeholder country-error"
            aria-invalid="true"
            value=""
          />
        </div>
        <div id="react-select-country-placeholder">Select a country</div>
        <div id="country-error" class="field-error">Select a country</div>
      </div>
      <p>Required: * indicates a required field</p>
      <section>PUBLIC BURDEN STATEMENT OMB Paperwork Reduction Act text.</section>
    </form>
  `);

  const result = await extractGreenhouseValidationErrors({
    page,
    provider: "greenhouse",
  });

  expect(result.validationErrorCount).toBe(1);
  expect(result.errors[0]).toEqual(
    expect.objectContaining({
      text: "Select a country",
      fieldLabel: "Country",
      fieldId: "country",
      describedByText: "Select a country Select a country",
      category: "invalid_location",
      repairable: true,
    }),
  );
});

test("Greenhouse React Select country filler commits selected option", async ({ page }) => {
  await page.setContent(`
    <form>
      <div class="field field_with_errors" id="country-field">
        <label id="country-label" for="country">Country</label>
        <div class="react-select__control" id="country-control">
          <span id="country-selected"></span>
          <input
            id="country"
            role="combobox"
            aria-labelledby="country-label"
            aria-describedby="react-select-country-placeholder country-error"
            aria-invalid="true"
            value=""
          />
        </div>
        <div id="react-select-country-placeholder">Select a country</div>
        <div id="country-error" class="field-error">Select a country</div>
      </div>
      <div id="country-options" role="listbox" style="display:none">
        <div id="react-select-country-option-0" role="option">United States</div>
      </div>
    </form>
    <script>
      const input = document.getElementById('country');
      const options = document.getElementById('country-options');
      const option = document.getElementById('react-select-country-option-0');
      input.addEventListener('input', () => { options.style.display = 'block'; });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') option.click();
      });
      option.addEventListener('click', () => {
        document.getElementById('country-selected').textContent = 'United States';
        input.value = '';
        input.setAttribute('aria-invalid', 'false');
        input.setAttribute('aria-describedby', 'react-select-country-placeholder');
        document.getElementById('country-error').textContent = '';
        document.getElementById('react-select-country-placeholder').textContent = '';
        options.style.display = 'none';
      });
    </script>
  `);

  const fill = await fillGreenhouseReactSelectCountry({
    page,
    countryAnswer: "United States",
    applicationId: "test_application",
    sessionId: "test_session",
  });

  expect(fill.filled).toBe(true);
  await expect(page.locator("#country-selected")).toHaveText("United States");
  await expect(page.locator("#country")).toHaveAttribute("aria-invalid", "false");

  const validation = await extractGreenhouseValidationErrors({
    page,
    provider: "greenhouse",
  });
  expect(validation.validationErrorCount).toBe(0);
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
