import { expect, test } from "@playwright/test";
import {
  resolveLocationAnswer,
  resolveProfileLocationForApplicationField,
} from "@/app/lib/apply/locationAnswerResolver";

test("resolves free-text location from saved city state and country", () => {
  const result = resolveLocationAnswer({
    userProfile: {
      city: "Savannah",
      state: "GA",
      country: "United States",
    },
    fieldLabel: "Where are you located?",
  });

  expect(result.answer).toBe("Savannah, GA, United States");
  expect(result.answerKind).toBe("city_state_country");
  expect(result.source).toBe("profile");
});

test("resolves country dropdown answer from profile country context", () => {
  const result = resolveLocationAnswer({
    userProfile: {
      city: "Savannah",
      state: "GA",
    },
    fieldLabel: "Country",
    fieldOptions: ["United States", "Canada"],
  });

  expect(result.answer).toBe("United States");
  expect(result.answerKind).toBe("country");
});

test("returns dedicated country and full location answers for application dropdowns", () => {
  const result = resolveProfileLocationForApplicationField({
    userProfile: {
      personalInfoCity: "Savannah",
      personalInfoState: "GA",
    },
    fieldLabel: "Where are you located?",
    fieldOptions: ["United States", "Canada"],
  });

  expect(result.countryAnswer).toBe("United States");
  expect(result.fullLocationAnswer).toBe("Savannah, GA, United States");
  expect(result.confidence).toBe("high");
});
