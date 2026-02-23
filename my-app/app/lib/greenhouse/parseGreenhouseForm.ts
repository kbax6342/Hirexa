// my-app/app/lib/greenhouse/parseGreenhouseForm.ts
import * as cheerio from "cheerio";

export type GhField = {
  name: string;
  type: string; // text | email | tel | textarea | select | file | radio | checkbox | hidden | etc.
  label: string;
  required: boolean;
  placeholder?: string;
  questionKey?: string;
  options?: Array<{ value: string; label: string }>;
};

export type GhParsedForm = {
  action: string;
  method: "POST" | "GET";
  hidden: Record<string, string>;
  fields: GhField[];
  debug: {
    pickedFormReason: string;
    formCount: number;
    pickedFormAction?: string;
    pickedFormMethod?: string;
    iframeUsed?: string | null;
    actionSuspicious?: boolean;
    actionSuspiciousReason?: string;
  };
};

type GhOption = { value: string; label: string };

function toAbsUrl(base: string, url: string) {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function norm(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function guessRequiredFromLabel(label: string) {
  return /\*/.test(label) || /\brequired\b/i.test(label);
}

function safeMethod(m: string | undefined | null): "POST" | "GET" {
  const up = String(m || "POST").toUpperCase();
  return up === "GET" ? "GET" : "POST";
}

function isJobsPageUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    return /\/jobs\/\d+/.test(path) || /\/embed\/[^/]+\/jobs\/\d+/.test(path) || path.includes("/jobs/");
  } catch {
    return /\/jobs\//i.test(url);
  }
}

function normalizeAction($form: cheerio.Cheerio, baseUrl: string) {
  const rawAction = $form.attr("action") || "";
  return new URL(rawAction, baseUrl).toString();
}

function looksLikeGreenhouseApplicationForm($form: cheerio.Cheerio) {
  const action = norm($form.attr("action") || "");
  const hasFile = $form.find("input[type='file']").length > 0;
  const hasEmail = $form.find("input[type='email'], input[name*='email' i]").length > 0;
  const hasName =
    $form.find("input[name*='first' i], input[name*='last' i], input[name*='name' i]").length > 0;

  const actionLooks =
    /applications|apply|job_application|candidate/i.test(action) || /greenhouse/i.test(action);

  const hasGhFieldNames =
    $form.find(
      "input[name*='job_application' i], textarea[name*='job_application' i], select[name*='job_application' i], input[name*='candidate' i], textarea[name*='candidate' i], select[name*='candidate' i], input[name*='answers_attributes' i], textarea[name*='answers_attributes' i], select[name*='answers_attributes' i], input[name*='question' i]"
    ).length > 0;
  const hasStrictApplicationInputs =
    $form.find(
      "input[name*='job_application[' i], textarea[name*='job_application[' i], select[name*='job_application[' i], input[name*='job_application' i], textarea[name*='job_application' i], select[name*='job_application' i], input[name*='candidate[' i], textarea[name*='candidate[' i], select[name*='candidate[' i], input[name*='answers_attributes' i], textarea[name*='answers_attributes' i], select[name*='answers_attributes' i]"
    ).length > 0;
  const hasAnswersAttributes =
    $form.find(
      "input[name*='answers_attributes' i], textarea[name*='answers_attributes' i], select[name*='answers_attributes' i]"
    ).length > 0;

  const inputCount = $form.find("input, textarea, select").length;

  let score = 0;
  if (hasFile) score += 5;
  if (actionLooks) score += 3;
  if (hasGhFieldNames) score += 3;
  if (hasStrictApplicationInputs) score += 25;
  if (hasAnswersAttributes) score += 10;
  if (hasEmail) score += 2;
  if (hasName) score += 1;
  if (inputCount >= 8) score += 2;

  return { score, action, hasFile, inputCount };
}

function hasApplicationInputs($: cheerio.CheerioAPI, formEl: cheerio.Element) {
  return (
    $(formEl).find(
      "input[name*='job_application[' i], textarea[name*='job_application[' i], select[name*='job_application[' i], input[name*='job_application' i], textarea[name*='job_application' i], select[name*='job_application' i], input[name*='candidate[' i], textarea[name*='candidate[' i], select[name*='candidate[' i], input[name*='answers_attributes' i], textarea[name*='answers_attributes' i], select[name*='answers_attributes' i]"
    ).length > 0
  );
}

function findBestForm($: cheerio.CheerioAPI) {
  const forms = $("form").toArray();
  const strictForms = forms.filter((el) => hasApplicationInputs($, el));
  const candidateForms = strictForms.length > 0 ? strictForms : forms;
  let best: { el: cheerio.Element; score: number; reason: string } | null = null;

  for (const el of candidateForms) {
    const $form = $(el);
    const { score, action, hasFile, inputCount } = looksLikeGreenhouseApplicationForm($form);

    const id = norm($form.attr("id") || "");
    const cls = norm($form.attr("class") || "");
    const isSearchy = /search|newsletter|subscribe/i.test(`${id} ${cls} ${action}`);

    if (isSearchy) continue;
    if (inputCount === 0) continue;

    const reasonParts = [
      `score=${score}`,
      hasFile ? "hasFile" : "",
      action ? `action=${action}` : "",
      `inputs=${inputCount}`,
    ].filter(Boolean);

    if (!best || score > best.score) {
      best = { el, score, reason: reasonParts.join(" | ") };
    }
  }

  if (!best && candidateForms.length > 0) {
    best = { el: candidateForms[0], score: 0, reason: "fallback:first_form" };
  }

  return best;
}

function findQuestionScope($el: cheerio.Cheerio) {
  const scope = $el.closest("li, .field, .question, .application-question, [data-qa], fieldset, div");
  return scope.length ? scope.first() : $el.parent();
}

function extractQuestionLabel($: cheerio.CheerioAPI, $form: cheerio.Cheerio, $el: cheerio.Cheerio) {
  const id = norm($el.attr("id") || "");
  const aria = norm($el.attr("aria-label") || "");
  const ph = norm($el.attr("placeholder") || "");
  const name = norm($el.attr("name") || "");

  if (id) {
    const byFor = norm($form.find(`label[for="${id}"]`).first().text());
    if (byFor) return byFor;
  }

  const scope = findQuestionScope($el);

  const scopeLegend = norm(scope.find("legend").first().text());
  if (scopeLegend) return scopeLegend;

  const directLabel = norm(scope.children("label").first().text()) || norm(scope.find("> label").first().text());
  if (directLabel) return directLabel;

  const closestLabel = norm($el.closest("label").text());
  if (closestLabel) return closestLabel;

  const anyScopeLabel = norm(scope.find("label").first().text());
  if (anyScopeLabel) return anyScopeLabel;

  const questionLike = norm(scope.find(".question, .field-label, .application-question, p").first().text());
  if (questionLike) return questionLike;

  if (aria) return aria;
  if (ph) return ph;
  if (name) return name;

  return "Field";
}

function isRequiredEl($el: cheerio.Cheerio, label: string) {
  const reqAttr = $el.attr("required");
  if (reqAttr !== undefined) return true;

  const ariaReq = norm($el.attr("aria-required") || "");
  if (ariaReq === "true") return true;

  const dataReq = norm($el.attr("data-required") || "");
  if (dataReq === "true" || dataReq === "required") return true;

  if (guessRequiredFromLabel(label)) return true;

  const scope = findQuestionScope($el);
  const scopeRequired =
    scope.attr("aria-required") === "true" ||
    scope.attr("data-required") === "true" ||
    /\brequired\b/i.test(norm(scope.attr("class") || ""));
  if (scopeRequired) return true;

  return false;
}

function toQuestionKey(name: string) {
  const match = name.match(/job_application\[answers_attributes\]\[(\d+)\]\[(.+?)\]/);
  if (!match) return undefined;
  return `answers_attributes_${match[1]}`;
}

function optionLabelFromInput($: cheerio.CheerioAPI, $optEl: cheerio.Cheerio) {
  const id = norm($optEl.attr("id") || "");
  const byFor = id ? norm($(`label[for="${id}"]`).first().text()) : "";
  if (byFor) return byFor;

  const wrapped = norm($optEl.closest("label").text());
  if (wrapped) return wrapped;

  const sibling = norm(
    $optEl
      .nextAll("label, span")
      .first()
      .text()
  );
  if (sibling) return sibling;

  return String($optEl.attr("value") ?? "Option");
}

function dedupeOptions(options: GhOption[]) {
  const seen = new Set<string>();
  return options.filter((o) => {
    const key = `${o.value}|${o.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickStrictSubmitForm($: cheerio.CheerioAPI, selectedFormEl: cheerio.Element, baseUrl: string): {
  formEl: cheerio.Element;
  reason: string;
} {
  const $selected = $(selectedFormEl);
  const selectedAction = normalizeAction($selected, baseUrl);
  const selectedRawAction = norm($selected.attr("action") || "");
  const selectedLooksWrong = !selectedRawAction || isJobsPageUrl(selectedAction);

  if (!selectedLooksWrong) {
    return { formEl: selectedFormEl, reason: "selected:action-ok" };
  }

  const alt = $("form")
    .filter((_, form) => hasApplicationInputs($, form))
    .first()
    .get(0);

  if (alt) {
    return { formEl: alt, reason: `selected:replaced_due_to_action(${selectedAction})` };
  }

  return { formEl: selectedFormEl, reason: `selected:kept_suspicious_action(${selectedAction})` };
}

function extractForm(
  $: cheerio.CheerioAPI,
  formEl: cheerio.Element,
  baseUrl: string,
  debug: GhParsedForm["debug"]
) {
  const strictPick = pickStrictSubmitForm($, formEl, baseUrl);
  const $form = $(strictPick.formEl);

  const action = normalizeAction($form, baseUrl);
  let method = safeMethod($form.attr("method"));
  if (method === "GET") method = "POST";

  const hidden: Record<string, string> = {};
  $form
    .find(
      "input[type='hidden'], input[name*='csrf' i], input[name*='token' i], input[name*='security' i], input[id*='security' i]"
    )
    .each((_, el) => {
      const $el = $(el);
      const name = norm($el.attr("name") || "");
      if (!name) return;
      hidden[name] = String($el.attr("value") ?? "");
    });

  const fieldsByName = new Map<string, GhField>();
  const orderedNames: string[] = [];

  const upsertField = (field: GhField) => {
    const existing = fieldsByName.get(field.name);

    const next: GhField = existing
      ? {
          ...existing,
          ...field,
          label: field.label || existing.label,
          placeholder: field.placeholder || existing.placeholder,
          questionKey: field.questionKey || existing.questionKey,
          required: existing.required || field.required,
          options: field.options ?? existing.options ?? [],
        }
      : {
          ...field,
          options: field.options ?? [],
        };

    fieldsByName.set(field.name, next);
    if (!orderedNames.includes(field.name)) orderedNames.push(field.name);
  };

  $form.find("input, textarea, select").each((_, el) => {
    const $el = $(el);
    const tag = ($el.get(0) as cheerio.Element).tagName.toLowerCase();
    const inputType = norm($el.attr("type") || "text").toLowerCase();
    const type = tag === "input" ? inputType : tag;

    if (type === "hidden" || type === "submit" || type === "button" || type === "image") return;

    const name = norm($el.attr("name") || "");
    if (!name) return;

    const placeholder = norm($el.attr("placeholder") || "");
    const rawLabel = extractQuestionLabel($, $form, $el).replace(/\*/g, "").trim();
    const label = rawLabel || placeholder || name;
    const required = isRequiredEl($el, rawLabel || placeholder || name);
    const questionKey = toQuestionKey(name);

    if (type === "radio" || type === "checkbox") {
      const value = String($el.attr("value") ?? (type === "checkbox" ? "on" : ""));
      const optionLabel = optionLabelFromInput($, $el).replace(/\*/g, "").trim() || value || "Option";

      const current = fieldsByName.get(name);
      const options = dedupeOptions([...(current?.options ?? []), { value, label: optionLabel }]);

      upsertField({
        name,
        type,
        label,
        placeholder,
        required,
        questionKey,
        options,
      });
      return;
    }

    if (type === "select") {
      const options: GhOption[] = [];
      $el.find("option").each((__, opt) => {
        const $opt = $(opt);
        const value = String($opt.attr("value") ?? "");
        const optLabel = norm($opt.text());
        if (!value && !optLabel) return;
        if (!value && /select|choose|please/i.test(optLabel)) return;
        options.push({ value, label: optLabel || value });
      });

      upsertField({
        name,
        type: "select",
        label,
        placeholder,
        required,
        questionKey,
        options: dedupeOptions(options),
      });
      return;
    }

    upsertField({
      name,
      type: tag === "textarea" ? "textarea" : type,
      label,
      placeholder,
      required,
      questionKey,
    });
  });

  const fields: GhField[] = orderedNames
    .map((name) => fieldsByName.get(name))
    .filter((f): f is GhField => Boolean(f && f.type !== "hidden"))
    .map((f) => ({
      ...f,
      label: f.label || f.placeholder || f.name,
      options: f.options ?? [],
    }));

  debug.pickedFormReason = `${debug.pickedFormReason || ""}${debug.pickedFormReason ? " | " : ""}${strictPick.reason}`;
  debug.pickedFormAction = action;
  debug.pickedFormMethod = method;

  return { action, method, hidden, fields, debug };
}

function parseBoardAndJobId(jobUrl: string) {
  try {
    const u = new URL(jobUrl);
    const parts = u.pathname.split("/").filter(Boolean);

    const board = parts[0] || "";
    const jobsIdx = parts.findIndex((p) => p === "jobs");
    const jobId = jobsIdx >= 0 ? parts[jobsIdx + 1] || "" : "";

    return { board, jobId };
  } catch {
    return { board: "", jobId: "" };
  }
}

function buildEmbedJobAppUrl(jobUrl: string) {
  const { board, jobId } = parseBoardAndJobId(jobUrl);
  if (!board || !jobId) return "";

  return `https://boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(jobId)}`;
}

async function parseFromHtml(html: string, baseUrl: string, debugPrefix: string): Promise<GhParsedForm | null> {
  const $ = cheerio.load(html);
  const best = findBestForm($);
  const fallbackForm = $("form").first().get(0);
  const picked =
    best ??
    (fallbackForm
      ? { el: fallbackForm, score: 0, reason: "fallback:first_form" }
      : null);

  if (!picked) return null;

  const debug: GhParsedForm["debug"] = {
    pickedFormReason: `${debugPrefix}:${picked.reason}`,
    formCount: $("form").length,
    iframeUsed: baseUrl,
  };

  const parsed = extractForm($, picked.el, baseUrl, debug);
  if (isJobsPageUrl(parsed.action)) {
    parsed.debug.actionSuspicious = true;
    parsed.debug.actionSuspiciousReason = "looks_like_jobs_page";
  }
  return parsed;
}

/**
 * Main entry
 */
export async function parseGreenhouseForm(jobUrl: string): Promise<GhParsedForm> {
  const defaultHeaders = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    accept: "text/html",
  };

  const res = await fetch(jobUrl, {
    cache: "no-store",
    headers: defaultHeaders,
  });

  if (!res.ok) {
    throw new Error(`Failed to load job page: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const iframeSrc =
    $("iframe[src*='/embed/job_app']").attr("src") || $("iframe[src*='job_app?for=']").attr("src") || "";

  const fallbackEmbedUrl = buildEmbedJobAppUrl(jobUrl);
  const iframeUrl = iframeSrc ? toAbsUrl(jobUrl, iframeSrc) : fallbackEmbedUrl;

  if (iframeUrl) {
    const iframeRes = await fetch(iframeUrl, { cache: "no-store", headers: defaultHeaders });
    if (iframeRes.ok) {
      const iframeHtml = await iframeRes.text();
      const parsedIframe = await parseFromHtml(iframeHtml, iframeUrl, "iframe");
      if (parsedIframe) return parsedIframe;
    }
  }

  const parsedPage = await parseFromHtml(html, jobUrl, "page");
  if (!parsedPage) {
    throw new Error("No form detected on job page (and no usable iframe).");
  }

  return parsedPage;
}
