import { expect, test } from "@playwright/test";
import { selectDropdownValue } from "@/app/lib/apply/dropdownSelect";
import type { FormFieldDescriptor } from "@/app/lib/apply/formIntelligence/types";

function field(overrides: Partial<FormFieldDescriptor>): FormFieldDescriptor {
  return {
    id: overrides.id ?? "field",
    selector: overrides.selector ?? "#field",
    label: overrides.label ?? "Field",
    inputType: overrides.inputType ?? "text",
    required: overrides.required ?? true,
    disabled: false,
    visible: true,
    pageUrl: "https://example.test/apply",
    ...overrides,
  };
}

test("dropdown helper selects native select by exact label", async ({ page }) => {
  await page.setContent(`
    <select id="country" required>
      <option value="">Select...</option>
      <option value="US">United States</option>
    </select>
  `);

  const result = await selectDropdownValue(
    page,
    field({ selector: "#country", label: "Country", inputType: "select", tagName: "SELECT" }),
    "United States",
  );

  expect(result.success).toBe(true);
  await expect(page.locator("#country")).toHaveValue("US");
});

test("dropdown helper selects native select by partial label", async ({ page }) => {
  await page.setContent(`
    <select id="phone_country" required>
      <option value="">Choose...</option>
      <option value="US">United States +1</option>
      <option value="GB">United Kingdom +44</option>
    </select>
  `);

  const result = await selectDropdownValue(
    page,
    field({
      selector: "#phone_country",
      label: "Phone country code",
      inputType: "select",
      tagName: "SELECT",
    }),
    "+1",
  );

  expect(result.success).toBe(true);
  await expect(page.locator("#phone_country")).toHaveValue("US");
});

test("dropdown helper commits custom combobox option selection", async ({ page }) => {
  await page.setContent(`
    <div class="application-question">
      <div>How did you hear about this opportunity?*</div>
      <input id="source" role="combobox" placeholder="Select..." aria-required="true" />
      <div role="listbox">
        <div role="option" onclick="
          const input = document.getElementById('source');
          input.value = 'Job board';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        ">Job board</div>
      </div>
    </div>
  `);

  const result = await selectDropdownValue(
    page,
    field({
      selector: "#source",
      label: "How did you hear about this opportunity?",
      roleAttribute: "combobox",
      placeholder: "Select...",
    }),
    "Hirexa AI / job board",
  );

  expect(result.success).toBe(true);
  await expect(page.locator("#source")).toHaveValue("Job board");
});

test("dropdown helper selects country from search autocomplete", async ({ page }) => {
  await page.setContent(`
    <div class="field">
      <label id="country-label">Country</label>
      <input id="country" role="combobox" placeholder="Search" aria-labelledby="country-label" />
      <div role="listbox">
        <div role="option" onclick="
          const input = document.getElementById('country');
          input.value = 'United States';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        ">United States</div>
      </div>
    </div>
  `);

  const result = await selectDropdownValue(
    page,
    field({
      selector: "#country",
      label: "Country",
      roleAttribute: "combobox",
      placeholder: "Search",
    }),
    "US",
  );

  expect(result.success).toBe(true);
  await expect(page.locator("#country")).toHaveValue("United States");
});
