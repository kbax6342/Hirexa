import { expect, test } from "@playwright/test";
import { generateApplicationFieldAnswer } from "@/app/lib/apply/ai-form-answer-generator";
import { classifyRequiredApplicationField } from "@/app/lib/apply/form-field-classifier";

test("classifies common required custom questions before failure", () => {
  expect(
    classifyRequiredApplicationField({
      questionLabel: "Why do you want to work at Speechify?",
      fieldType: "textarea",
      required: true,
    }).category,
  ).toBe("answerable_by_ai");

  const technicalProblem = classifyRequiredApplicationField({
    questionLabel: "What is one of the hardest technical problems you have worked on?",
    fieldType: "textarea",
    required: true,
  });
  expect(technicalProblem.category).toBe("answerable_by_ai");
  expect(technicalProblem.detailCategory).toBe("resume_backed_experience_question");

  expect(
    classifyRequiredApplicationField({
      questionLabel: "Where are you located?",
      fieldType: "text",
      required: true,
    }).category,
  ).toBe("answerable_from_profile");
});

test("generates safe default answers from profile, resume, and job context", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const source = await generateApplicationFieldAnswer({
      questionLabel: "How did you hear about this opportunity?",
      fieldType: "text",
      required: true,
      profile: { city: "Savannah", state: "GA" },
      resumeText: "Software developer with automation and API integration experience.",
      applicationContext: {},
    });
    expect(source.answer).toContain("researching roles");
    expect(source.sourceHints).toContain("safe_default");

    const location = await generateApplicationFieldAnswer({
      questionLabel: "Where are you located?",
      fieldType: "text",
      required: true,
      profile: { city: "Savannah", state: "GA" },
    });
    expect(location.answer).toBe("Savannah, GA");

    const why = await generateApplicationFieldAnswer({
      questionLabel: "Why do you want to work here?",
      fieldType: "textarea",
      required: true,
      jobTitle: "Software Engineer",
      companyName: "ExampleCo",
      jobDescription: "Build useful AI-driven productivity software.",
      resumeText: "Software developer with automation, frontend, backend, and API experience.",
    });
    expect(why.answer).toContain("ExampleCo");
    expect(why.answer.length).toBeGreaterThan(80);
  } finally {
    if (previousKey) {
      process.env.OPENAI_API_KEY = previousKey;
    }
  }
});

test("does not guess sensitive/legal application answers", async () => {
  const result = await generateApplicationFieldAnswer({
    questionLabel: "Are you legally authorized to work in the United States?",
    fieldType: "text",
    required: true,
    profile: {},
  });

  expect(result.answer).toBe("");
  expect(result.requiresUserConfirmation).toBe(true);
});
