import type { Frame, Page } from "playwright-core";
import {
  listCachedApplicationAnswers,
  setCachedApplicationAnswer,
} from "@/app/lib/apply/applicationAnswerCache";
import { resolveApplicationFieldAnswer } from "@/app/lib/apply/applicationAnswerResolver";
import { generateApplicationQuestionAnswer } from "@/app/lib/apply/aiFormQuestionAnswerer";
import {
  isMappedFieldMissing,
  mapApplicationFields,
  type MappedApplicationField,
} from "@/app/lib/apply/formFieldMapper";
import { generateFormAnswers } from "@/app/lib/apply/formIntelligence/aiFormAnswerGenerator";
import { fillGeneratedAnswers } from "@/app/lib/apply/formIntelligence/playwrightFormFiller";
import { fillPhoneGroup } from "@/app/lib/apply/phoneFieldFiller";
import {
  fillLocationDropdownField,
  fillLocationFields,
  isLocationLikeField,
} from "@/app/lib/apply/locationFieldFiller";
import type {
  FillGeneratedAnswersResult,
  FormFieldDescriptor,
  GeneratedFormAnswer,
} from "@/app/lib/apply/formIntelligence/types";

export type IterativeFormFillResult = {
  completed: boolean;
  submitted: boolean;
  submitAttempted: boolean;
  submitConfirmed: boolean;
  passCount: number;
  fieldsMapped: number;
  fieldsFilled: number;
  aiAnswersGenerated: number;
  cachedAnswersUsed: number;
  answersCached: number;
  resumeUploadAttempted: boolean;
  resumeUploadSucceeded: boolean;
  remainingRequiredFields: string[];
  blockedFields: Array<{
    fieldId: string;
    label: string;
    reason: string;
    classification: string;
    answerDraft?: string | null;
    options?: string[];
    sensitive?: boolean;
  }>;
  missingQuestions?: Array<{
    fieldId: string;
    label: string;
    type?: string;
    options?: string[];
    classification?: string;
    reason?: string;
    aiDraft?: string | null;
    sensitive?: boolean;
  }>;
  stopReason?: string;
  lastAction?: string;
};

type FillApplicationFormIterativelyInput = {
  page: Page;
  frame?: Frame | null;
  applicationId: string;
  sessionId: string;
  jobContext?: {
    jobTitle?: string | null;
    companyName?: string | null;
    jobDescription?: string | null;
    source?: string | null;
  };
  userProfile?: unknown;
  resumeContext?: {
    resumeText?: string | null;
    resumeSummary?: string | null;
  };
  existingApplicationMaterials?: unknown;
  resumePath?: string | null;
  maxPasses?: number;
  autoSubmit?: boolean;
};

function descriptorsFrom(fields: MappedApplicationField[]) {
  return fields
    .map((field) => field.descriptor)
    .filter((field): field is FormFieldDescriptor => Boolean(field));
}

function visibleMissing(fields: MappedApplicationField[]) {
  return fields.filter(isMappedFieldMissing);
}

function answerLength(value: unknown) {
  if (Array.isArray(value)) return value.join(",").length;
  return String(value ?? "").length;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function currentAnswersFromMaterials(value: unknown) {
  const record = asRecord(value);
  return asRecord(record.values);
}

function applicationAnswerPreferencesFromProfile(profile: unknown) {
  const record = asRecord(profile);
  return asRecord(asRecord(record.keyQuestions).applicationAnswerPreferences);
}

function isMissingLocationField(field: MappedApplicationField) {
  return (
    isLocationLikeField(field) ||
    /\b(where are you located|where.*based|current location|location|country|country\/region)\b/i.test(
      `${field.label} ${field.groupLabel ?? ""}`,
    )
  );
}

function mergeBlocked(
  existing: IterativeFormFillResult["blockedFields"],
  next: IterativeFormFillResult["blockedFields"],
) {
  const merged = [...existing];
  for (const item of next) {
    if (!merged.some((existingItem) => existingItem.fieldId === item.fieldId)) {
      merged.push(item);
    }
  }
  return merged;
}

async function hasVisibleVerificationChallenge(page: Page) {
  const selectorMatch = await page
    .locator(
      'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], .g-recaptcha, .h-captcha, [data-sitekey]',
    )
    .first()
    .isVisible()
    .catch(() => false);
  if (selectorMatch) return true;

  const bodyText = await page.innerText("body").catch(() => "");
  return /verify you are human|complete verification|security check|checking your browser|captcha|enter verification code|we sent a code/i.test(
    bodyText,
  );
}

async function clickSubmitIfReady(page: Page, context?: {
  applicationId?: string;
  sessionId?: string;
  pass?: number;
}) {
  if (await hasVisibleVerificationChallenge(page)) {
    console.log("[AUTO_APPLY_READY_FOR_USER_REVIEW]", {
      applicationId: context?.applicationId ?? null,
      sessionId: context?.sessionId ?? null,
      pass: context?.pass ?? null,
      currentUrl: page.url(),
      reason: "visible_verification_challenge_before_submit",
    });
    return { attempted: false, confirmed: false, blockedByVerification: true };
  }

  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit application")',
    'button:has-text("Submit Application")',
    'button:has-text("Send application")',
    'button:has-text("Complete application")',
    'button:has-text("Apply now")',
    'button:has-text("Apply Now")',
    'button:has-text("Apply")',
    'button:has-text("Submit")',
    'button:has-text("Continue")',
    'button:has-text("Next")',
  ];

  for (const selector of submitSelectors) {
    const button = page.locator(selector).first();
    if ((await button.count().catch(() => 0)) === 0) continue;
    if (!(await button.isVisible().catch(() => false))) continue;
    if (!(await button.isEnabled().catch(() => false))) continue;

    console.log("[AUTO_APPLY_SUBMIT_AFTER_RECHECK]", {
      applicationId: context?.applicationId ?? null,
      sessionId: context?.sessionId ?? null,
      pass: context?.pass ?? null,
      currentUrl: page.url(),
      selector,
      status: "SUBMITTING_APPLICATION",
    });
    console.log("[AUTO_APPLY_SUBMIT] submit button found", {
      selector,
      currentUrl: page.url(),
    });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => null),
      button.click(),
    ]);
    console.log("[AUTO_APPLY_SUBMIT] clicked submit", {
      selector,
      currentUrl: page.url(),
    });
    console.log("[AUTO_APPLY_SUBMIT] submit clicked after location fill", {
      applicationId: context?.applicationId ?? null,
      sessionId: context?.sessionId ?? null,
      pass: context?.pass ?? null,
      selector,
      currentUrl: page.url(),
    });
    await page.waitForTimeout(1_000).catch(() => undefined);
    const bodyText = await page.innerText("body").catch(() => "");
    const confirmed =
      /thank you|application submitted|successfully submitted|received your application|application complete/i.test(
        bodyText,
      );
    console.log(
      confirmed
        ? "[AUTO_APPLY_SUBMIT] submission confirmed"
        : "[AUTO_APPLY_SUBMIT] submission not confirmed",
      {
        currentUrl: page.url(),
      },
    );
    return { attempted: true, confirmed };
  }

  return { attempted: false, confirmed: false, blockedByVerification: false };
}

export async function fillApplicationFormIteratively(
  input: FillApplicationFormIterativelyInput,
): Promise<IterativeFormFillResult> {
  const target = input.frame ?? input.page;
  const maxPasses = Math.max(1, input.maxPasses ?? 4);
  let fieldsFilled = 0;
  let aiAnswersGenerated = 0;
  let cachedAnswersUsed = 0;
  let answersCached = 0;
  let resumeUploadAttempted = false;
  let resumeUploadSucceeded = false;
  let lastFieldsMapped = 0;
  let remainingRequiredFields: string[] = [];
  let blockedFields: IterativeFormFillResult["blockedFields"] = [];
  let lastAction = "started_iterative_form_fill";

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    console.log("[AUTO_APPLY_FIELD_MAP] pass started", {
      applicationId: input.applicationId,
      sessionId: input.sessionId,
      pass,
      currentUrl: input.page.url(),
    });

    const mapped = await mapApplicationFields(target);
    lastFieldsMapped = mapped.length;
    console.log("[AUTO_APPLY_FIELD_MAP] mapped fields", {
      applicationId: input.applicationId,
      sessionId: input.sessionId,
      pass,
      fieldCount: mapped.length,
      requiredCount: mapped.filter((field) => field.required).length,
      labels: mapped.map((field) => field.label).slice(0, 40),
    });

    const descriptors = descriptorsFrom(mapped);
    const generatedKnownAnswers = await generateFormAnswers({
      userProfile: input.userProfile,
      resumeText: input.resumeContext?.resumeText ?? undefined,
      resumeSummary: input.resumeContext?.resumeSummary ?? undefined,
      jobTitle: input.jobContext?.jobTitle ?? undefined,
      companyName: input.jobContext?.companyName ?? undefined,
      jobDescription: input.jobContext?.jobDescription ?? undefined,
      source: input.jobContext?.source ?? undefined,
      existingApplicationAnswers: {},
      fields: descriptors,
    });
    const knownFill = await fillGeneratedAnswers(input.page, generatedKnownAnswers.answers, {
      fields: descriptors,
      resumePath: input.resumePath,
      applicationId: input.applicationId,
      sessionId: input.sessionId,
    });
    fieldsFilled += knownFill.filledCount;
    resumeUploadAttempted = resumeUploadAttempted || knownFill.resumeUploadAttempted;
    resumeUploadSucceeded = resumeUploadSucceeded || knownFill.resumeUploadSucceeded;

    let afterKnown = await mapApplicationFields(target);
    const phoneResult = await fillPhoneGroup({
      page: input.page,
      fields: afterKnown,
      userProfile: input.userProfile,
    });
    if (phoneResult.attempted && phoneResult.phoneNumberFilled) {
      fieldsFilled += 1;
      afterKnown = await mapApplicationFields(target);
    }
    const locationResult = await fillLocationFields({
      page: input.page,
      pageOrFrame: target,
      fields: afterKnown,
      userProfile: input.userProfile,
      jobLocation: null,
      applicationId: input.applicationId,
      sessionId: input.sessionId,
    });
    if (locationResult.attempted && locationResult.filledCount > 0) {
      fieldsFilled += locationResult.filledCount;
      afterKnown = await mapApplicationFields(target);
    }
    let missing = visibleMissing(afterKnown);
    const missingLocationField = missing.find(isMissingLocationField);
    if (missingLocationField) {
      const targetedLocationFill = await fillLocationDropdownField({
        page: input.page,
        field: missingLocationField,
        userProfile: input.userProfile,
        jobContext: { location: null },
        applicationId: input.applicationId,
        sessionId: input.sessionId,
      });
      if (targetedLocationFill.attempted) {
        afterKnown = await mapApplicationFields(target);
        missing = visibleMissing(afterKnown);
        if (!missing.some(isMissingLocationField)) {
          console.log("[AUTO_APPLY_LOCATION] removed from missingRequiredFields", {
            applicationId: input.applicationId,
            sessionId: input.sessionId,
            pass,
            label: missingLocationField.label,
          });
        }
      }
    }
    remainingRequiredFields = missing.map((field) => field.label);
    if (missing.length === 0) {
      console.log("[AUTO_APPLY_FORM_RECHECK] all safe required fields filled", {
        applicationId: input.applicationId,
        sessionId: input.sessionId,
        pass,
        currentUrl: input.page.url(),
      });
      console.log("[AUTO_APPLY_FORM_RECHECK_PASS]", {
        applicationId: input.applicationId,
        sessionId: input.sessionId,
        pass,
        currentUrl: input.page.url(),
        missingRequiredFields: [],
        blockedCount: blockedFields.length,
        autoSubmit: Boolean(input.autoSubmit),
      });
      if (input.autoSubmit) {
        console.log("[AUTO_APPLY_SUBMIT] all required fields complete", {
          applicationId: input.applicationId,
          sessionId: input.sessionId,
          pass,
          currentUrl: input.page.url(),
        });
        const submit = await clickSubmitIfReady(input.page, {
          applicationId: input.applicationId,
          sessionId: input.sessionId,
          pass,
        });
        return {
          completed: true,
          submitted: submit.confirmed,
          submitAttempted: submit.attempted,
          submitConfirmed: submit.confirmed,
          passCount: pass,
          fieldsMapped: lastFieldsMapped,
          fieldsFilled,
          aiAnswersGenerated,
          cachedAnswersUsed,
          answersCached,
          resumeUploadAttempted,
          resumeUploadSucceeded,
          remainingRequiredFields: [],
          blockedFields,
          stopReason: submit.blockedByVerification
            ? "real_verification_required"
            : submit.attempted && !submit.confirmed
              ? "submit_pending_confirmation"
              : undefined,
          lastAction: submit.attempted
            ? "submit_clicked_after_successful_recheck"
            : submit.blockedByVerification
              ? "verification_blocked_submit_after_recheck"
              : "all_required_fields_filled",
        };
      }
      console.log("[AUTO_APPLY_READY_FOR_USER_REVIEW]", {
        applicationId: input.applicationId,
        sessionId: input.sessionId,
        pass,
        currentUrl: input.page.url(),
        reason: "all_required_fields_filled_auto_submit_disabled",
      });
      return {
        completed: true,
        submitted: false,
        submitAttempted: false,
        submitConfirmed: false,
        passCount: pass,
        fieldsMapped: lastFieldsMapped,
        fieldsFilled,
        aiAnswersGenerated,
        cachedAnswersUsed,
        answersCached,
        resumeUploadAttempted,
        resumeUploadSucceeded,
        remainingRequiredFields: [],
        blockedFields,
        stopReason: "ready_for_user_review",
        lastAction: "ready_for_user_review_after_successful_recheck",
      };
    }

    const passAnswers: GeneratedFormAnswer[] = [];
    const passBlocked: IterativeFormFillResult["blockedFields"] = [];
    const cachedBefore = listCachedApplicationAnswers({
      applicationId: input.applicationId,
      sessionId: input.sessionId,
    }).length;

    for (const field of missing) {
      console.log("[AUTO_APPLY_AI_ANSWER] missing required field detected", {
        applicationId: input.applicationId,
        sessionId: input.sessionId,
        pass,
        label: field.label,
        type: field.type,
        fingerprint: field.fingerprint,
      });
      const resolved = await resolveApplicationFieldAnswer({
        label: field.label,
        name: field.sourceHints.name,
        placeholder: field.sourceHints.placeholder,
        type: field.type,
        options: field.options,
        required: field.required,
        userProfile: input.userProfile,
        applicationAnswerPreferences: applicationAnswerPreferencesFromProfile(input.userProfile),
        resumeText:
          input.resumeContext?.resumeText ?? input.resumeContext?.resumeSummary ?? null,
        jobTitle: input.jobContext?.jobTitle,
        companyName: input.jobContext?.companyName,
        jobDescription: input.jobContext?.jobDescription,
        currentAnswers: currentAnswersFromMaterials(input.existingApplicationMaterials) as Record<string, string>,
      });
      if (resolved.answer && !resolved.needsUser && field.descriptor) {
        passAnswers.push({
          fieldId: field.descriptor.id,
          label: field.label,
          value: resolved.answer,
          confidence: "high",
          sourceBasis: [resolved.source],
          safeToAutofill: true,
          requiresUserReview: false,
          reason: resolved.reason,
        });
        console.log("[APPLICATION_ANSWER_RESOLVER] resolved fillable required field", {
          applicationId: input.applicationId,
          sessionId: input.sessionId,
          pass,
          label: field.label,
          classification: resolved.classification,
          source: resolved.source,
          sensitive: resolved.sensitive,
        });
        continue;
      }
      if (
        resolved.answer &&
        resolved.source === "ai_draft" &&
        !resolved.sensitive &&
        field.descriptor
      ) {
        setCachedApplicationAnswer({
          applicationId: input.applicationId,
          sessionId: input.sessionId,
          fieldId: field.fieldId,
          fieldFingerprint: field.fingerprint,
          questionLabel: field.label,
          label: field.label,
          normalizedLabel: field.normalizedLabel,
          answer: resolved.answer,
          classification: String(resolved.classification),
          confidence: "medium",
          answerSource: "ai_generated",
          sourceHints: ["ai_draft", "job_context", "resume_context"],
        });
        passAnswers.push({
          fieldId: field.descriptor.id,
          label: field.label,
          value: resolved.answer,
          confidence: "medium",
          sourceBasis: ["ai_draft", "open_ended"],
          safeToAutofill: true,
          requiresUserReview: false,
          reason: resolved.reason,
        });
        console.log("[AUTO_APPLY_AI_ANSWER] generated textarea answer", {
          applicationId: input.applicationId,
          sessionId: input.sessionId,
          pass,
          label: field.label,
          classification: resolved.classification,
          answerLength: answerLength(resolved.answer),
        });
        console.log("[AUTO_APPLY_AI_ANSWER] temp saved answer", {
          applicationId: input.applicationId,
          sessionId: input.sessionId,
          pass,
          label: field.label,
          fieldFingerprint: field.fingerprint,
        });
        continue;
      }
      if (resolved.needsUser && resolved.source === "ai_draft") {
        passBlocked.push({
          fieldId: field.fieldId,
          label: field.label,
          reason: resolved.reason,
          classification: resolved.classification,
          answerDraft: resolved.answer,
          options: field.options,
          sensitive: resolved.sensitive,
        });
        console.log("[AUTO_APPLY_MISSING_QUESTIONS]", {
          applicationId: input.applicationId,
          sessionId: input.sessionId,
          label: field.label,
          classification: resolved.classification,
          hasAiDraft: Boolean(resolved.answer),
          sensitive: resolved.sensitive,
        });
        continue;
      }
      const answer = await generateApplicationQuestionAnswer({
        applicationId: input.applicationId,
        sessionId: input.sessionId,
        field,
        jobTitle: input.jobContext?.jobTitle,
        companyName: input.jobContext?.companyName,
        jobDescription: input.jobContext?.jobDescription,
        resumeText:
          input.resumeContext?.resumeText ?? input.resumeContext?.resumeSummary ?? null,
        userProfile: input.userProfile,
        existingApplicationMaterials: input.existingApplicationMaterials,
        cachedAnswers: listCachedApplicationAnswers({
          applicationId: input.applicationId,
          sessionId: input.sessionId,
        }),
      });

      if (answer.cached) {
        cachedAnswersUsed += 1;
        console.log("[AUTO_APPLY_AI_ANSWER] cache hit", {
          applicationId: input.applicationId,
          sessionId: input.sessionId,
          pass,
          label: field.label,
          confidence: answer.confidence,
        });
      }

      if (!answer.shouldFill || !answer.answer || !field.descriptor) {
        const phoneControlFailed =
          field.fieldKind === "phone_number_input" ||
          field.fieldKind === "phone_country_code_select" ||
          field.fieldKind === "phone_country_search_input" ||
          field.fieldKind === "phone_country_code_search_internal";
        const locationControlFailed = isLocationLikeField(field);
        if (locationControlFailed) {
          console.log("[AUTO_APPLY_LOCATION] stop message corrected", {
            applicationId: input.applicationId,
            sessionId: input.sessionId,
            label: field.label,
            reason: "location_control_validation_failed",
          });
        }
        passBlocked.push({
          fieldId: field.fieldId,
          label: field.label,
          reason:
            phoneControlFailed && phoneResult.phoneExistsInProfile
              ? "Phone number exists in profile, but the form's phone/country-code control did not validate after autofill."
              : locationControlFailed
                ? "Profile location/country exists, but the form's location/country control did not validate after autofill."
              : answer.reason,
          classification: phoneControlFailed
            ? "phone-control-validation-failed"
            : locationControlFailed
              ? "location-control-validation-failed"
            : answer.classification,
          answerDraft: resolved.answer,
          options: field.options,
          sensitive: resolved.sensitive,
        });
        console.log("[AUTO_APPLY_AI_ANSWER] skipped sensitive/manual field", {
          applicationId: input.applicationId,
          sessionId: input.sessionId,
          pass,
          label: field.label,
          classification: answer.classification,
          reason: answer.reason,
        });
        continue;
      }

      aiAnswersGenerated += answer.cached ? 0 : 1;
      passAnswers.push({
        fieldId: field.descriptor.id,
        label: field.label,
        value: answer.answer,
        confidence: answer.confidence,
        sourceBasis: [answer.classification],
        safeToAutofill: true,
        requiresUserReview: false,
        reason: answer.reason,
      });
      console.log("[AUTO_APPLY_AI_ANSWER] generated answer", {
        applicationId: input.applicationId,
        sessionId: input.sessionId,
        pass,
        label: field.label,
        confidence: answer.confidence,
        classification: answer.classification,
        answerLength: answerLength(answer.answer),
        reason: answer.reason,
      });
    }

    const cachedAfter = listCachedApplicationAnswers({
      applicationId: input.applicationId,
      sessionId: input.sessionId,
    }).length;
    answersCached += Math.max(0, cachedAfter - cachedBefore);
    if (cachedAfter > cachedBefore) {
      console.log("[AUTO_APPLY_AI_ANSWER] temp saved answer", {
        applicationId: input.applicationId,
        sessionId: input.sessionId,
        pass,
        savedCount: cachedAfter - cachedBefore,
      });
    }

    if (passAnswers.length === 0 && passBlocked.length >= missing.length) {
      remainingRequiredFields = missing.map((field) => field.label);
      blockedFields = mergeBlocked(blockedFields, passBlocked);
      console.log("[AUTO_APPLY_FORM_RECHECK] missing required after pass", {
        applicationId: input.applicationId,
        sessionId: input.sessionId,
        pass,
        currentUrl: input.page.url(),
        missingRequiredFields: remainingRequiredFields,
        blockedCount: blockedFields.length,
      });
      return {
        completed: false,
        submitted: false,
        submitAttempted: false,
        submitConfirmed: false,
        passCount: pass,
        fieldsMapped: lastFieldsMapped,
        fieldsFilled,
        aiAnswersGenerated,
        cachedAnswersUsed,
        answersCached,
        resumeUploadAttempted,
        resumeUploadSucceeded,
          remainingRequiredFields,
          blockedFields,
          missingQuestions: blockedFields.map((field) => ({
            fieldId: field.fieldId,
            label: field.label,
            classification: field.classification,
            reason: field.reason,
            aiDraft: field.answerDraft ?? null,
            options: field.options,
            sensitive: field.sensitive,
          })),
          stopReason: "sensitive_required_field_requires_user",
        lastAction: "sensitive_required_field_requires_user",
      };
    }

    const aiFill: FillGeneratedAnswersResult | null = passAnswers.length
      ? await fillGeneratedAnswers(input.page, passAnswers, {
          fields: passAnswers
            .map((answer) =>
              missing.find((field) => field.descriptor?.id === answer.fieldId)?.descriptor,
            )
            .filter((field): field is FormFieldDescriptor => Boolean(field)),
          resumePath: input.resumePath,
          applicationId: input.applicationId,
          sessionId: input.sessionId,
        })
      : null;

    if (aiFill) {
      fieldsFilled += aiFill.filledCount;
      for (const field of aiFill.filledFields) {
        console.log("[AUTO_APPLY_AI_ANSWER] filled answer", {
          applicationId: input.applicationId,
          sessionId: input.sessionId,
          pass,
          label: field.label,
        });
        console.log("[AUTO_APPLY_AI_ANSWER] verified field value", {
          applicationId: input.applicationId,
          sessionId: input.sessionId,
          pass,
          label: field.label,
        });
      }
    }

    const afterAi = await mapApplicationFields(target);
    const stillMissing = visibleMissing(afterAi);
    remainingRequiredFields = stillMissing.map((field) => field.label);
    blockedFields = mergeBlocked(blockedFields, passBlocked);
    console.log("[AUTO_APPLY_FORM_RECHECK] missing required after pass", {
      applicationId: input.applicationId,
      sessionId: input.sessionId,
      pass,
      currentUrl: input.page.url(),
      missingRequiredFields: remainingRequiredFields,
      blockedCount: blockedFields.length,
    });

    const madeProgress = (knownFill.filledCount + (aiFill?.filledCount ?? 0)) > 0;
    lastAction = madeProgress ? "filled_fields_and_rechecked" : "no_progress_after_ai_fill_pass";
    if (stillMissing.length === 0) {
      console.log("[AUTO_APPLY_FORM_RECHECK_PASS]", {
        applicationId: input.applicationId,
        sessionId: input.sessionId,
        pass,
        currentUrl: input.page.url(),
        missingRequiredFields: [],
        blockedCount: blockedFields.length,
        autoSubmit: Boolean(input.autoSubmit),
      });
      if (blockedFields.length === 0 && input.autoSubmit) {
        console.log("[AUTO_APPLY_SUBMIT] all required fields complete", {
          applicationId: input.applicationId,
          sessionId: input.sessionId,
          pass,
          currentUrl: input.page.url(),
        });
        const submit = await clickSubmitIfReady(input.page, {
          applicationId: input.applicationId,
          sessionId: input.sessionId,
          pass,
        });
        return {
          completed: true,
          submitted: submit.confirmed,
          submitAttempted: submit.attempted,
          submitConfirmed: submit.confirmed,
          passCount: pass,
          fieldsMapped: lastFieldsMapped,
          fieldsFilled,
          aiAnswersGenerated,
          cachedAnswersUsed,
          answersCached,
          resumeUploadAttempted,
          resumeUploadSucceeded,
          remainingRequiredFields: [],
          blockedFields,
          stopReason: submit.blockedByVerification
            ? "real_verification_required"
            : submit.attempted && !submit.confirmed
              ? "submit_pending_confirmation"
              : undefined,
          lastAction: submit.attempted
            ? "submit_clicked_after_successful_recheck"
            : submit.blockedByVerification
              ? "verification_blocked_submit_after_recheck"
              : "all_required_fields_filled",
        };
      }
      console.log("[AUTO_APPLY_READY_FOR_USER_REVIEW]", {
        applicationId: input.applicationId,
        sessionId: input.sessionId,
        pass,
        currentUrl: input.page.url(),
        reason: blockedFields.length
          ? "blocked_fields_require_review_after_recheck"
          : "all_required_fields_filled_auto_submit_disabled",
      });
      return {
        completed: true,
        submitted: false,
        submitAttempted: false,
        submitConfirmed: false,
        passCount: pass,
        fieldsMapped: lastFieldsMapped,
        fieldsFilled,
        aiAnswersGenerated,
        cachedAnswersUsed,
        answersCached,
        resumeUploadAttempted,
        resumeUploadSucceeded,
        remainingRequiredFields: [],
        blockedFields,
        missingQuestions: blockedFields.map((field) => ({
          fieldId: field.fieldId,
          label: field.label,
          classification: field.classification,
          reason: field.reason,
          aiDraft: field.answerDraft ?? null,
          options: field.options,
          sensitive: field.sensitive,
        })),
        stopReason: blockedFields.length
          ? "user_review_required_for_form_fields"
          : "ready_for_user_review",
        lastAction: blockedFields.length
          ? "ready_for_user_review_after_successful_recheck"
          : "ready_to_submit_after_successful_recheck",
      };
    }
    if (!madeProgress) {
      return {
        completed: false,
        submitted: false,
        submitAttempted: false,
        submitConfirmed: false,
        passCount: pass,
        fieldsMapped: lastFieldsMapped,
        fieldsFilled,
        aiAnswersGenerated,
        cachedAnswersUsed,
        answersCached,
        resumeUploadAttempted,
        resumeUploadSucceeded,
        remainingRequiredFields,
        blockedFields,
        missingQuestions: blockedFields.map((field) => ({
          fieldId: field.fieldId,
          label: field.label,
          classification: field.classification,
          reason: field.reason,
          aiDraft: field.answerDraft ?? null,
          options: field.options,
          sensitive: field.sensitive,
        })),
        stopReason: blockedFields.length
          ? "required_fields_still_missing_after_ai_pass"
          : "no_progress_after_ai_fill_pass",
        lastAction,
      };
    }
  }

  return {
    completed: remainingRequiredFields.length === 0,
    submitted: false,
    submitAttempted: false,
    submitConfirmed: false,
    passCount: maxPasses,
    fieldsMapped: lastFieldsMapped,
    fieldsFilled,
    aiAnswersGenerated,
    cachedAnswersUsed,
    answersCached,
    resumeUploadAttempted,
    resumeUploadSucceeded,
    remainingRequiredFields,
    blockedFields,
    missingQuestions: blockedFields.map((field) => ({
      fieldId: field.fieldId,
      label: field.label,
      classification: field.classification,
      reason: field.reason,
      aiDraft: field.answerDraft ?? null,
      options: field.options,
      sensitive: field.sensitive,
    })),
    stopReason: remainingRequiredFields.length
      ? "required_fields_still_missing_after_ai_pass"
      : undefined,
    lastAction,
  };
}
