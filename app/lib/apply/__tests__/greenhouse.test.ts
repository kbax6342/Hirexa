import { expect, test } from "@playwright/test";
import {
  detectGreenhouseApplicationForm,
  fillGreenhouseApplicationForm,
  isGreenhouseBoardUrl,
  isGreenhouseUrl,
} from "@/app/lib/apply/providers/greenhouse";

test("detects supported greenhouse job-board hosts", () => {
  expect(
    isGreenhouseUrl(
      "https://job-boards.greenhouse.io/speechify/jobs/5975356004",
    ),
  ).toBeTruthy();
  expect(
    isGreenhouseUrl("https://boards.greenhouse.io/example/jobs/1234567"),
  ).toBeTruthy();
  expect(
    isGreenhouseUrl(
      "https://job-boards.eu.greenhouse.io/example/jobs/1234567",
    ),
  ).toBeTruthy();
  expect(
    isGreenhouseBoardUrl(
      "https://job-boards.eu.greenhouse.io/example/jobs/1234567",
    ),
  ).toBeTruthy();
});

test("detects a visible greenhouse application form", async ({ page }) => {
  await page.setContent(`
    <form id="application_form">
      <label for="first_name">First Name</label>
      <input id="first_name" name="job_application[first_name]" />
      <label for="last_name">Last Name</label>
      <input id="last_name" name="job_application[last_name]" />
      <label for="email">Email</label>
      <input id="email" name="job_application[email]" type="email" />
      <label for="resume">Resume</label>
      <input id="resume" name="job_application[resume]" type="file" />
      <button type="submit">Submit Application</button>
    </form>
  `);

  const detection = await detectGreenhouseApplicationForm(page);

  expect(detection.formDetected).toBeTruthy();
  expect(detection.visibleFieldCount).toBe(4);
  expect(detection.fillableFieldCount).toBe(4);
  expect(detection.requiredFieldCount).toBe(0);
  expect(detection.submitButtonFound).toBeTruthy();
});

test("fills greenhouse fields and reports remaining required answers", async ({
  page,
}) => {
  await page.setContent(`
    <form id="application_form">
      <label for="first_name">First Name *</label>
      <input id="first_name" name="job_application[first_name]" required />
      <label for="last_name">Last Name *</label>
      <input id="last_name" name="job_application[last_name]" required />
      <label for="email">Email *</label>
      <input id="email" name="job_application[email]" type="email" required />
      <label for="work_auth">Work authorization *</label>
      <select id="work_auth" name="job_application[work_authorization]" required>
        <option value="">Select one</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      <button type="submit">Apply</button>
    </form>
  `);

  const result = await fillGreenhouseApplicationForm(page, {
    values: {
      "job_application[first_name]": "Ada",
      "job_application[last_name]": "Lovelace",
      "job_application[email]": "ada@example.com",
    },
  });

  expect(result.formDetected).toBeTruthy();
  expect(result.filledFieldCount).toBe(3);
  expect(result.requiredFieldCount).toBe(4);
  expect(result.missingRequiredFields).toEqual(["Work authorization"]);
  await expect(page.locator('input[name="job_application[first_name]"]')).toHaveValue(
    "Ada",
  );
  await expect(page.locator('input[name="job_application[last_name]"]')).toHaveValue(
    "Lovelace",
  );
  await expect(page.locator('input[name="job_application[email]"]')).toHaveValue(
    "ada@example.com",
  );
});
