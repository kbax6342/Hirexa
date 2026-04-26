import { expect, test } from "@playwright/test";
import { generateApplicationFieldAnswer } from "@/app/lib/apply/ai-form-answer-generator";
import { classifyRequiredApplicationField } from "@/app/lib/apply/form-field-classifier";
import { generateFormAnswers } from "@/app/lib/apply/formIntelligence/aiFormAnswerGenerator";
import { fillGeneratedAnswers } from "@/app/lib/apply/formIntelligence/playwrightFormFiller";
import { scanCurrentForm } from "@/app/lib/apply/formIntelligence/formScanner";
import { deriveStopClassification } from "@/app/lib/apply/stopClassification";

test("form scanner infers labels and options from a generic application form", async ({
  page,
}) => {
  await page.setContent(`
    <form>
      <h2>Candidate details</h2>
      <label for="email">Email address *</label>
      <input id="email" name="email" type="email" required />
      <div class="question">
        <span>How did you hear about this opportunity?</span>
        <select name="source" required>
          <option value="">Choose one</option>
          <option value="hirexa">Hirexa AI</option>
          <option value="linkedin">LinkedIn</option>
        </select>
      </div>
      <fieldset>
        <legend>Work authorization</legend>
        <label><input type="radio" name="sponsorship" value="yes" required /> Yes</label>
        <label><input type="radio" name="sponsorship" value="no" required /> No</label>
      </fieldset>
    </form>
  `);

  const fields = await scanCurrentForm(page);

  expect(fields.map((field) => field.label)).toEqual(
    expect.arrayContaining([
      "Email address *",
      expect.stringContaining("How did you hear"),
      expect.stringContaining("Yes"),
    ]),
  );
  expect(fields.find((field) => field.name === "source")?.options).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: "Hirexa AI", value: "hirexa" }),
    ]),
  );
  expect(fields.every((field) => field.label !== "Field")).toBe(true);
});

test("answer generator fills safe known answers and blocks unknown sensitive/legal fields", async () => {
  const result = await generateFormAnswers({
    userProfile: {
      firstName: "Ava",
      lastName: "Stone",
      email: "ava@example.com",
      city: "Savannah",
      state: "GA",
    },
    source: "Hirexa AI",
    fields: [
      {
        id: "email",
        selector: "#email",
        label: "Email address",
        inputType: "email",
        required: true,
        disabled: false,
        visible: true,
        pageUrl: "https://careers.example.com/apply",
      },
      {
        id: "location",
        selector: "#location",
        label: "Where are you located?",
        inputType: "text",
        required: true,
        disabled: false,
        visible: true,
        pageUrl: "https://careers.example.com/apply",
      },
      {
        id: "source",
        selector: "#source",
        label: "How did you hear about this opportunity?",
        inputType: "select",
        required: true,
        disabled: false,
        visible: true,
        options: [
          { label: "Hirexa AI", value: "hirexa" },
          { label: "Other", value: "other" },
        ],
        pageUrl: "https://careers.example.com/apply",
      },
      {
        id: "sponsorship",
        selector: "input[name='sponsorship']",
        label: "Will you now or in the future require sponsorship?",
        inputType: "radio",
        required: true,
        disabled: false,
        visible: true,
        options: [
          { label: "Yes", value: "yes" },
          { label: "No", value: "no" },
        ],
        pageUrl: "https://careers.example.com/apply",
      },
      {
        id: "certify",
        selector: "#certify",
        label: "I certify that the information provided is true",
        inputType: "checkbox",
        required: true,
        disabled: false,
        visible: true,
        pageUrl: "https://careers.example.com/apply",
      },
    ],
  });

  expect(result.answers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ fieldId: "email", value: "ava@example.com" }),
      expect.objectContaining({ fieldId: "location", value: "Savannah, GA" }),
      expect.objectContaining({ fieldId: "source", value: "hirexa" }),
    ]),
  );
  expect(result.blockedFields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ fieldId: "sponsorship", category: "sensitive" }),
      expect.objectContaining({ fieldId: "certify", category: "legal" }),
    ]),
  );
});

test("generic classifier treats common open-ended application questions as answerable", () => {
  expect(
    classifyRequiredApplicationField({
      questionLabel: "Why do you want to work at Speechify?",
      fieldType: "textarea",
      required: true,
    }).category,
  ).toBe("answerable_by_ai");

  expect(
    classifyRequiredApplicationField({
      questionLabel: "What is one of the hardest technical problems you have worked on?",
      fieldType: "textarea",
      required: true,
    }).category,
  ).toBe("answerable_from_resume");

  expect(
    classifyRequiredApplicationField({
      questionLabel: "I certify that the information provided is true",
      fieldType: "checkbox",
      required: true,
    }).category,
  ).toBe("requires_user_confirmation");
});

test("single-field answer generator uses safe defaults and blocks unknown sensitive answers", async () => {
  const source = await generateApplicationFieldAnswer({
    questionLabel: "How did you hear about this opportunity?",
    fieldType: "text",
    required: true,
    profile: {},
    applicationContext: {},
  });
  expect(source.answer).toContain("software development background");
  expect(source.confidence).toBe("high");

  const location = await generateApplicationFieldAnswer({
    questionLabel: "Where are you located?",
    fieldType: "text",
    required: true,
    profile: {},
  });
  expect(location.answer).toContain("United States");

  const salary = await generateApplicationFieldAnswer({
    questionLabel: "What are your salary expectations?",
    fieldType: "text",
    required: true,
    profile: {},
  });
  expect(salary.answer).toBe("");
  expect(salary.requiresUserConfirmation).toBe(true);
});

test("playwright form filler writes generated answers and reports remaining required fields", async ({
  page,
}) => {
  await page.setContent(`
    <form>
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" required />
      <label for="source">How did you hear about us?</label>
      <select id="source" name="source" required>
        <option value="">Choose one</option>
        <option value="hirexa">Hirexa AI</option>
      </select>
      <label><input type="checkbox" id="certify" required /> I certify this application</label>
    </form>
  `);
  const fields = await scanCurrentForm(page);

  const result = await fillGeneratedAnswers(page, [
    {
      fieldId: fields.find((field) => field.name === "email")?.id ?? "email",
      label: "Email address",
      value: "ava@example.com",
      confidence: "high",
      sourceBasis: ["user_profile"],
      safeToAutofill: true,
      requiresUserReview: false,
      reason: "Known profile email.",
    },
    {
      fieldId: fields.find((field) => field.name === "source")?.id ?? "source",
      label: "How did you hear about us?",
      value: "hirexa",
      confidence: "high",
      sourceBasis: ["application_source"],
      safeToAutofill: true,
      requiresUserReview: false,
      reason: "Known source.",
    },
  ], { fields });

  await expect(page.locator("#email")).toHaveValue("ava@example.com");
  await expect(page.locator("#source")).toHaveValue("hirexa");
  expect(result.filledCount).toBe(2);
  expect(result.remainingRequiredFields).toEqual(
    expect.arrayContaining([expect.stringContaining("I certify")]),
  );
});

test("scanner and filler handle visible iframe forms generically", async ({ page }) => {
  await page.setContent(`
    <iframe srcdoc='
      <form>
        <label for="first">First name</label>
        <input id="first" name="firstName" required />
      </form>
    '></iframe>
  `);

  const fields = await scanCurrentForm(page);
  const iframeField = fields.find((field) => field.name === "firstName");

  expect(iframeField?.frameUrl).toBeTruthy();

  const result = await fillGeneratedAnswers(page, [
    {
      fieldId: iframeField?.id ?? "first",
      label: "First name",
      value: "Ava",
      confidence: "high",
      sourceBasis: ["user_profile"],
      safeToAutofill: true,
      requiresUserReview: false,
      reason: "Known profile first name.",
    },
  ], { fields });

  const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
  await expect(frame!.locator("#first")).toHaveValue("Ava");
  expect(result.remainingRequiredFields).toEqual([]);
});

test("scanner and filler handle contenteditable application questions", async ({ page }) => {
  await page.setContent(`
    <form>
      <label id="why-label">Why are you interested in this role?</label>
      <div id="why" role="textbox" contenteditable="true" aria-labelledby="why-label" aria-required="true"></div>
    </form>
  `);
  const fields = await scanCurrentForm(page);
  const field = fields.find((item) => item.idAttribute === "why");

  expect(field?.label).toBe("Why are you interested in this role?");

  const result = await fillGeneratedAnswers(page, [
    {
      fieldId: field?.id ?? "why",
      label: "Why are you interested in this role?",
      value: "This role aligns with my software engineering background.",
      confidence: "medium",
      sourceBasis: ["job_context"],
      safeToAutofill: true,
      requiresUserReview: false,
      reason: "Safe open-ended answer.",
    },
  ], { fields });

  await expect(page.locator("#why")).toHaveText(
    "This role aligns with my software engineering background.",
  );
  expect(result.remainingRequiredFields).toEqual([]);
});

test("stop classification keeps missing answers after AI distinct from verification", () => {
  const stop = deriveStopClassification({
    status: "WAITING_HUMAN",
    needsHuman: true,
    formDetected: true,
    formScanAttempted: true,
    formFound: true,
    formFillAttempted: true,
    aiFormAnswerEngineRan: true,
    aiFormAnswersGenerated: true,
    aiFormRemainingRequiredFields: ["Will you require sponsorship?"],
    finalReason: "missing_required_answers_after_ai",
  });

  expect(stop.reason).toBe("missing_required_answers_after_ai");
  expect(stop.reason).not.toBe("verification_required");
});
