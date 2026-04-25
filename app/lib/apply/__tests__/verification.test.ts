import { expect, test } from "@playwright/test";
import { detectVerificationGate } from "@/app/lib/apply/verification";

test("detects common verification gate text", () => {
  const result = detectVerificationGate({
    title: "Just a moment...",
    pageText: "Checking your browser before accessing careers.rtx.com",
  });

  expect(result.detected).toBeTruthy();
  expect(result.pageType).toBe("verification_gate");
  expect(result.reason).toBe("Human verification required");
});

test("does not classify normal job page text as verification", () => {
  const result = detectVerificationGate({
    title: "Senior Software Engineer",
    pageText: "Apply now and submit your resume.",
  });

  expect(result.detected).toBeFalsy();
});
