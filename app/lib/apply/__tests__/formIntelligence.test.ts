import { expect, test } from "@playwright/test";
import { generateApplicationFieldAnswer } from "@/app/lib/apply/ai-form-answer-generator";
import {
  canUseAiGeneratedAnswer,
  classifyApplicationField,
  isSensitiveVoluntaryField,
} from "@/app/lib/apply/applicationFieldClassifier";
import { resolveApplicationFieldAnswer } from "@/app/lib/apply/applicationAnswerResolver";
import {
  getCachedApplicationAnswer,
  setCachedApplicationAnswer,
} from "@/app/lib/apply/applicationAnswerCache";
import { classifyRequiredApplicationField } from "@/app/lib/apply/form-field-classifier";
import {
  mapApplicationFields,
  normalizeApplicationFieldLabel,
} from "@/app/lib/apply/formFieldMapper";
import { generateFormAnswers } from "@/app/lib/apply/formIntelligence/aiFormAnswerGenerator";
import { fillGeneratedAnswers } from "@/app/lib/apply/formIntelligence/playwrightFormFiller";
import { scanCurrentForm } from "@/app/lib/apply/formIntelligence/formScanner";
import { fillApplicationFormIteratively } from "@/app/lib/apply/iterativeFormFiller";
import { fillPhoneGroup } from "@/app/lib/apply/phoneFieldFiller";
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

test("form scanner uses parent question text instead of generic select placeholders", async ({
  page,
}) => {
  await page.setContent(`
    <form>
      <div class="application-question">
        <div class="question-label">How did you hear about this opportunity?*</div>
        <div class="react-select">
          <input id="source" role="combobox" placeholder="Select..." aria-required="true" />
        </div>
      </div>
      <div class="application-question">
        <div>Where are you located?*</div>
        <input id="location" role="combobox" placeholder="Search" aria-required="true" />
      </div>
    </form>
  `);

  const fields = await scanCurrentForm(page);
  const source = fields.find((field) => field.idAttribute === "source");
  const location = fields.find((field) => field.idAttribute === "location");

  expect(source?.label).toContain("How did you hear");
  expect(source?.label).not.toBe("Select...");
  expect(source?.labelSources).toContain("parent_group_text");
  expect(location?.label).toContain("Where are you located");
  expect(location?.label).not.toBe("Search");
});

test("custom select filler commits option selection instead of only typing text", async ({
  page,
}) => {
  await page.setContent(`
    <form>
      <div class="application-question">
        <div>How did you hear about this opportunity?*</div>
        <input id="source" role="combobox" placeholder="Select..." aria-required="true" />
        <div role="listbox">
          <div role="option" onclick="
            const input = document.getElementById('source');
            input.value = 'Job board';
            input.setAttribute('data-selected-value', 'job-board');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          ">Job board</div>
        </div>
      </div>
    </form>
  `);

  const fields = await scanCurrentForm(page);
  const source = fields.find((field) => field.idAttribute === "source");
  expect(source?.label).toContain("How did you hear");

  const result = await fillGeneratedAnswers(page, [
    {
      fieldId: source?.id ?? "source",
      label: source?.label ?? "How did you hear about this opportunity?",
      value: "Job board",
      confidence: "high",
      sourceBasis: ["application_source"],
      safeToAutofill: true,
      requiresUserReview: false,
      reason: "Safe source answer.",
    },
  ], { fields });

  await expect(page.locator("#source")).toHaveValue("Job board");
  expect(result.filledCount).toBe(1);
  expect(result.remainingRequiredFields).toEqual([]);
});

test("hidden recaptcha token fields are not treated as missing required answers", async ({
  page,
}) => {
  await page.setContent(`
    <form>
      <textarea name="g-recaptcha-response" required style="display:none"></textarea>
      <input name="recaptcha-token" type="hidden" required />
    </form>
  `);

  const fields = await scanCurrentForm(page);
  const result = await fillGeneratedAnswers(page, [], { fields });

  expect(result.remainingRequiredFields).toEqual([]);
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

test("application preference classifier and resolver keep voluntary answers user-owned", async () => {
  const genderClassification = classifyApplicationField({
    label: "Gender",
    type: "select",
    options: ["Female", "Male", "Prefer not to answer"],
  });
  expect(genderClassification).toBe("voluntary_self_id");
  expect(isSensitiveVoluntaryField(genderClassification)).toBe(true);

  const unresolvedGender = await resolveApplicationFieldAnswer({
    label: "Gender",
    type: "select",
    required: true,
    userProfile: {},
    applicationAnswerPreferences: {},
  });
  expect(unresolvedGender.answer).toBeNull();
  expect(unresolvedGender.needsUser).toBe(true);

  const savedGender = await resolveApplicationFieldAnswer({
    label: "Gender",
    type: "select",
    required: true,
    userProfile: {},
    applicationAnswerPreferences: {
      voluntarySelfId: { gender: "Prefer not to answer" },
    },
  });
  expect(savedGender.answer).toBe("Prefer not to answer");
  expect(savedGender.source).toBe("user_saved");
});

test("application answer resolver handles phone country code and open-ended drafts", async () => {
  const phoneCountry = await resolveApplicationFieldAnswer({
    label: "Phone country code",
    type: "select",
    required: true,
    userProfile: {
      phone: "9125557200",
      country: "United States",
    },
    applicationAnswerPreferences: {},
  });
  expect(phoneCountry.answer).toBe("+1");
  expect(phoneCountry.needsUser).toBe(false);

  const openEndedClassification = classifyApplicationField({
    label: "Why do you want to work here?",
    type: "textarea",
  });
  expect(openEndedClassification).toBe("open_ended");
  expect(canUseAiGeneratedAnswer(openEndedClassification)).toBe(true);

  const draft = await resolveApplicationFieldAnswer({
    label: "Why do you want to work here?",
    type: "textarea",
    required: true,
    companyName: "ExampleCo",
    jobTitle: "Software Engineer",
    resumeText: "Built application automation and API integrations.",
    userProfile: {},
    applicationAnswerPreferences: {},
  });
  expect(draft.source).toBe("ai_draft");
  expect(draft.needsUser).toBe(true);
  expect(draft.answer).toContain("ExampleCo");
});

test("AI answer pass does not downgrade required textareas to contact/profile blockers", async () => {
  const result = await generateFormAnswers({
    userProfile: {
      city: "Savannah",
      state: "GA",
      phone: "+1 912 555 7200",
    },
    resumeText:
      "Built Hirexa AI application automation, resume parsing, frontend/backend/API integrations, and workflow automation.",
    jobTitle: "Software Engineer",
    companyName: "Speechify",
    jobDescription: "Build useful AI-powered software for productivity and accessibility.",
    source: "Hirexa AI",
    fields: [
      {
        id: "why",
        selector: "#why",
        label: "Why do you want to work at Speechify?*",
        inputType: "textarea",
        required: true,
        disabled: false,
        visible: true,
        pageUrl: "https://boards.greenhouse.io/example",
      },
      {
        id: "hard",
        selector: "#hard",
        label: "What is one of the hardest technical problems you have worked on? *",
        inputType: "textarea",
        required: true,
        disabled: false,
        visible: true,
        pageUrl: "https://boards.greenhouse.io/example",
      },
      {
        id: "location",
        selector: "#location",
        label: "Where are you located?*",
        inputType: "text",
        required: true,
        disabled: false,
        visible: true,
        pageUrl: "https://boards.greenhouse.io/example",
      },
    ],
  });

  expect(result.blockedFields).toEqual([]);
  expect(result.answers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ fieldId: "why" }),
      expect.objectContaining({ fieldId: "hard" }),
      expect.objectContaining({ fieldId: "location", value: "Savannah, GA" }),
    ]),
  );
  expect(String(result.answers.find((answer) => answer.fieldId === "why")?.value ?? "")).not.toHaveLength(0);
  expect(String(result.answers.find((answer) => answer.fieldId === "hard")?.value ?? "")).not.toHaveLength(0);
});

test("field mapper repairs weak labels like Field using nearby question text", async ({
  page,
}) => {
  await page.setContent(`
    <form>
      <div class="application-question">
        <div>Why do you want to work at this company?</div>
        <input aria-label="Field" required />
      </div>
    </form>
  `);

  const fields = await mapApplicationFields(page);
  const field = fields.find((item) => item.required);

  expect(field?.label).toContain("Why do you want");
  expect(field?.label).not.toBe("Field");
  expect(field?.normalizedLabel).toBe(
    normalizeApplicationFieldLabel(field?.label),
  );
});

test("field mapper distinguishes duplicate phone controls and excludes recaptcha tokens", async ({
  page,
}) => {
  await page.setContent(`
    <form>
      <label for="phone_country">Phone country code</label>
      <select id="phone_country" name="phone_country" required>
        <option value="">Select...</option>
        <option value="US">United States +1</option>
      </select>
      <div class="phone-field">
        <span>Phone</span>
        <input aria-label="Unlabeled field" name="phone" autocomplete="tel" required />
      </div>
      <textarea name="g-recaptcha-response" required style="display:none"></textarea>
    </form>
  `);

  const fields = await mapApplicationFields(page);
  const phoneFields = fields.filter((field) => field.label.includes("Phone"));
  const recaptcha = fields.find((field) => field.sourceHints.name === "g-recaptcha-response");

  expect(phoneFields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: "Phone country code",
        fieldKind: "phone_country_code_select",
      }),
      expect.objectContaining({
        label: "Phone number",
        fieldKind: "phone_number_input",
      }),
    ]),
  );
  expect(recaptcha?.fieldKind).toBe("recaptcha_token");
});

test("field mapper keeps Greenhouse custom questions from becoming phone fields", async ({
  page,
}) => {
  await page.setContent(`
    <form>
      <div class="field">
        <label for="phone">Phone</label>
        <input id="phone" name="phone" type="tel" autocomplete="tel" required />
      </div>
      <div class="application-question">
        <label for="question_17630307004">How did you hear about this opportunity? *</label>
        <input id="question_17630307004" name="question_17630307004" required />
      </div>
      <div class="application-question">
        <label for="question_17630310004">Why do you want to work at Speechify?*</label>
        <textarea id="question_17630310004" name="question_17630310004" required></textarea>
      </div>
      <div class="application-question">
        <label for="question_17630311004">What is one of the hardest technical problems you have worked on? *</label>
        <textarea id="question_17630311004" name="question_17630311004" required></textarea>
      </div>
      <input id="iti-0__search-input" class="iti__search-input" role="combobox" aria-label="Phone country code search" />
    </form>
  `);

  const fields = await mapApplicationFields(page);
  const phone = fields.find((field) => field.sourceHints.name === "phone");
  const source = fields.find((field) => field.sourceHints.name === "question_17630307004");
  const why = fields.find((field) => field.sourceHints.name === "question_17630310004");
  const hard = fields.find((field) => field.sourceHints.name === "question_17630311004");
  const countrySearch = fields.find((field) => field.sourceHints.id === "iti-0__search-input");

  expect(phone?.fieldKind).toBe("phone_number_input");
  expect(source?.fieldKind).not.toBe("phone_number_input");
  expect(source?.label).toContain("How did you hear");
  expect(why?.fieldKind).not.toBe("phone_number_input");
  expect(why?.type).toBe("textarea");
  expect(why?.label).toContain("Why do you want");
  expect(hard?.fieldKind).not.toBe("phone_number_input");
  expect(hard?.type).toBe("textarea");
  expect(hard?.label).toContain("hardest technical");
  expect(countrySearch?.fieldKind).toBe("phone_country_code_search_internal");
});

test("phone group filler selects country code from phone before falling back to address", async ({
  page,
}) => {
  await page.setContent(`
    <form>
      <label for="phone_country">Phone country code</label>
      <select id="phone_country" name="phone_country" required>
        <option value="">Select...</option>
        <option value="US">United States +1</option>
        <option value="GB">United Kingdom +44</option>
      </select>
      <label for="phone">Phone</label>
      <input id="phone" name="phone" autocomplete="tel" required />
    </form>
  `);

  const fields = await mapApplicationFields(page);
  const result = await fillPhoneGroup({
    page,
    fields,
    userProfile: {
      phone: "+1 912 555 7200",
      country: "United Kingdom",
      address: "Savannah, GA",
    },
  });

  expect(result.phoneExistsInProfile).toBe(true);
  expect(result.countryCodeFilled).toBe(true);
  expect(result.phoneNumberFilled).toBe(true);
  await expect(page.locator("#phone_country")).toHaveValue("US");
  await expect(page.locator("#phone")).toHaveValue("(912) 555-7200");
});

test("temporary application answer cache reuses answers by fingerprint or label", () => {
  setCachedApplicationAnswer({
    applicationId: "app-cache-test",
    sessionId: "session-cache-test",
    fieldFingerprint: "why_role",
    questionLabel: "Why are you interested in this role?",
    answer: "This role aligns with my software engineering background.",
    confidence: "high",
    answerSource: "ai_generated",
  });

  const cached = getCachedApplicationAnswer({
    applicationId: "app-cache-test",
    sessionId: "session-cache-test",
    questionLabel: "Why are you interested in this role?",
  });

  expect(cached?.answer).toContain("software engineering");
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

test("iterative filler answers custom required questions and leaves legal fields blocked", async ({
  page,
}) => {
  await page.setContent(`
    <form>
      <label for="location">Where are you located?</label>
      <input id="location" required />
      <label for="why">Why do you want to work at Speechify?</label>
      <textarea id="why" required></textarea>
      <label for="hard">What is one of the hardest technical problems you have worked on?</label>
      <textarea id="hard" required></textarea>
      <label for="gender">Gender</label>
      <select id="gender" required>
        <option value="">Select</option>
        <option value="female">Female</option>
        <option value="male">Male</option>
      </select>
      <button type="submit">Submit application</button>
    </form>
  `);

  const result = await fillApplicationFormIteratively({
    page,
    applicationId: "app-iterative-test",
    sessionId: "session-iterative-test",
    jobContext: {
      jobTitle: "Software Engineer",
      companyName: "Speechify",
      jobDescription: "Build useful AI-powered software for productivity and accessibility.",
      source: "Hirexa AI",
    },
    userProfile: {
      city: "Savannah",
      state: "GA",
    },
    resumeContext: {
      resumeText:
        "Built Hirexa AI application automation, resume parsing, frontend/backend/API integrations, and workflow automation.",
    },
    resumePath: null,
    maxPasses: 2,
    autoSubmit: false,
  });

  await expect(page.locator("#location")).toHaveValue("Savannah, GA");
  await expect(page.locator("#why")).not.toHaveValue("");
  await expect(page.locator("#hard")).not.toHaveValue("");
  expect(result.completed).toBe(false);
  expect(result.remainingRequiredFields).toEqual(
    expect.arrayContaining(["Gender"]),
  );
  expect(result.blockedFields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: "Gender", classification: "sensitive_or_legal" }),
    ]),
  );
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
