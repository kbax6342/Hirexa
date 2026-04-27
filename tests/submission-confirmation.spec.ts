import { expect, test } from "@playwright/test";
import {
  detectSubmissionConfirmationAcrossPages,
  isSubmissionConfirmationText,
  isSubmissionConfirmationUrl,
} from "@/app/lib/apply/playwrightApply";

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
