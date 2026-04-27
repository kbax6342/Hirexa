import { expect, test } from "@playwright/test";
import { fillTextLikeField } from "@/app/lib/apply/textFieldFiller";

test("fills and verifies textarea values", async ({ page }) => {
  await page.setContent(`
    <label for="why">Why do you want to work here?</label>
    <textarea id="why" required></textarea>
  `);

  const result = await fillTextLikeField({
    locator: page.locator("#why"),
    answer: "I am interested in the role because it matches my background.",
    label: "Why do you want to work here?",
    fieldType: "textarea",
    applicationId: "app_test",
    sessionId: "session_test",
  });

  expect(result.filled).toBe(true);
  await expect(page.locator("#why")).toHaveValue(/matches my background/);
});

test("fills and verifies contenteditable textbox values", async ({ page }) => {
  await page.setContent(`
    <div id="project" role="textbox" contenteditable="true" aria-label="Describe a project"></div>
  `);

  const result = await fillTextLikeField({
    locator: page.locator("#project"),
    answer: "I built automation that connected frontend, backend, and API workflows.",
    label: "Describe a project",
    fieldType: "contenteditable",
    applicationId: "app_test",
    sessionId: "session_test",
  });

  expect(result.filled).toBe(true);
  await expect(page.locator("#project")).toContainText("frontend, backend");
});
