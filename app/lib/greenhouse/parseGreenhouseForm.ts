import * as cheerio from "cheerio";

export type GhField = {
  name: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
  questionKey?: string;
  options?: Array<{ value: string; label: string }>;
};

export type GhParsedForm = {
  embedUrl?: string;
  action: string;
  method: "POST" | "GET";
  hidden: Record<string, string>;
  fields: GhField[];
  debug: {
    greenhouseParserMode?: "strict" | "fallback";
    pickedFormReason?: string;
    formCount?: number;
    pickedFormAction?: string;
    pickedFormMethod?: string;
    iframeUsed?: string | null;
    iframeSrcFound?: string | null;
    formsFoundOnJobPage?: number;
    formsFoundOnEmbed?: number;
    firstBytesJobPage?: string;
    firstBytesEmbed?: string;
    selectedFormReason?: string;
    selectedFormFieldNames?: string[];
    selectedFormButtonTexts?: string[];
    fallbackFormParserUsed?: boolean;
    visibleInputCount?: number;
    visibleTextareaCount?: number;
    visibleSelectCount?: number;
    visibleFileInputCount?: number;
    actionSuspicious?: boolean;
    actionSuspiciousReason?: string;
    embedTried: Array<{ url: string; status?: number; ok?: boolean; note?: string }>;
    jobPagesTried: Array<{ url: string; status?: number; ok?: boolean; note?: string }>;
    selectedFormHasJobApplication?: boolean;
  };
};

type GhOption = { value: string; label: string };

type FetchHtmlResult =
  | { ok: true; status: number; url: string; html: string; note?: string; firstBytes: string }
  | { ok: false; status?: number; url: string; html: ""; note?: string; firstBytes: string };

function norm(s: string | null | undefined) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function lower(value: string | null | undefined) {
  return norm(value).toLowerCase();
}

function safeMethod(m: string | undefined | null): "POST" | "GET" {
  const up = String(m || "POST").toUpperCase();
  return up === "GET" ? "GET" : "POST";
}

function toAbsUrl(base: string, url: string) {
  try {
    return new URL(url, base).toString();
  } catch {
    return "";
  }
}

function toQuestionKey(name: string) {
  const match = name.match(/job_application\[answers_attributes\]\[(\d+)\]\[(.+?)\]/);
  if (!match) return undefined;
  return `answers_attributes_${match[1]}`;
}

function findQuestionScope($el: cheerio.Cheerio<any>) {
  const scope = $el.closest("li, .field, .question, .application-question, [data-qa], fieldset, div");
  return scope.length ? scope.first() : $el.parent();
}

function extractQuestionLabel(
  $: cheerio.CheerioAPI,
  $form: cheerio.Cheerio<any>,
  $el: cheerio.Cheerio<any>
) {
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

  if (aria) return aria;
  if (ph) return ph;
  if (name) return name;

  return "Field";
}

function isRequiredEl($el: cheerio.Cheerio<any>, label: string) {
  if ($el.attr("required") !== undefined) return true;
  const ariaReq = norm($el.attr("aria-required") || "");
  if (ariaReq === "true") return true;
  const dataReq = norm($el.attr("data-required") || "");
  if (dataReq === "true" || dataReq === "required") return true;
  if (/\*/.test(label) || /\brequired\b/i.test(label)) return true;

  const scope = findQuestionScope($el);
  return (
    scope.attr("aria-required") === "true" ||
    scope.attr("data-required") === "true" ||
    /\brequired\b/i.test(norm(scope.attr("class") || ""))
  );
}

function optionLabelFromInput($: cheerio.CheerioAPI, $optEl: cheerio.Cheerio<any>) {
  const id = norm($optEl.attr("id") || "");
  const byFor = id ? norm($(`label[for="${id}"]`).first().text()) : "";
  if (byFor) return byFor;

  const wrapped = norm($optEl.closest("label").text());
  if (wrapped) return wrapped;

  const sibling = norm($optEl.nextAll("label, span").first().text());
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

function toCamelCaseFromText(value: string) {
  const parts = norm(value)
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";

  return parts
    .map((part, index) => {
      const lowerPart = part.toLowerCase();
      if (index === 0) return lowerPart;
      return lowerPart.charAt(0).toUpperCase() + lowerPart.slice(1);
    })
    .join("");
}

function inferFallbackFieldName(args: {
  name: string;
  id: string;
  label: string;
  placeholder: string;
  type: string;
}) {
  if (args.name) return args.name;

  const combined = [args.id, args.label, args.placeholder, args.type]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(first name|firstname|given name)/i.test(combined)) return "firstName";
  if (/(last name|lastname|family name|surname)/i.test(combined)) return "lastName";
  if (/(e-mail|email)/i.test(combined)) return "email";
  if (/(phone|mobile|telephone)/i.test(combined)) return "phone";
  if (/(street|address)/i.test(combined)) return "address";
  if (/\bcity\b|\btown\b/i.test(combined)) return "city";
  if (/(state|province|region)/i.test(combined)) return "state";
  if (/(zip|postal|postcode)/i.test(combined)) return "postalCode";
  if (/(country code|phone country)/i.test(combined)) return "countryCode";
  if (/\bcountry\b/i.test(combined)) return "country";
  if (/\blocation\b/i.test(combined)) return "location";
  if (/linkedin/i.test(combined)) return "linkedin";
  if (/portfolio/i.test(combined)) return "portfolio";
  if (/(website|personal site|url)/i.test(combined)) return "website";
  if (/(work authorization|authorized to work|authorisation)/i.test(combined)) {
    return "workAuthorization";
  }
  if (/(sponsorship|sponsor|visa)/i.test(combined)) return "sponsorship";
  if (/pronoun/i.test(combined)) return "pronouns";
  if (/(ethnicity|race|eeo)/i.test(combined)) return "ethnicity";
  if (/veteran/i.test(combined)) return "veteran";
  if (/disability/i.test(combined)) return "disability";
  if (/gender/i.test(combined)) return "gender";
  if (args.type === "file" && /(resume|cv)/i.test(combined)) return "resume";
  if (args.type === "file" && /cover/i.test(combined)) return "coverLetter";

  return toCamelCaseFromText(args.id || args.label || args.placeholder || args.type);
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

function alternateHostUrl(inputUrl: string) {
  try {
    const u = new URL(inputUrl);
    if (u.hostname.startsWith("job-boards.greenhouse.io")) {
      u.hostname = "boards.greenhouse.io";
      return u.toString();
    }
    if (u.hostname.startsWith("job-boards.eu.greenhouse.io")) {
      u.hostname = "boards.greenhouse.io";
      return u.toString();
    }
    if (u.hostname.startsWith("boards.greenhouse.io")) {
      u.hostname = "job-boards.greenhouse.io";
      return u.toString();
    }
    return "";
  } catch {
    return "";
  }
}

function hasJobApplicationInputs($: cheerio.CheerioAPI, formEl: any) {
  return (
    $(formEl).find(
      "input[name*='job_application[' i], textarea[name*='job_application[' i], select[name*='job_application[' i], input[name*='job_application' i], textarea[name*='job_application' i], select[name*='job_application' i], input[name*='answers_attributes' i], textarea[name*='answers_attributes' i], select[name*='answers_attributes' i]"
    ).length > 0
  );
}

function normalizeAction(rawAction: string, baseUrl: string) {
  if (!norm(rawAction)) return baseUrl;
  return toAbsUrl(baseUrl, rawAction) || baseUrl;
}

function htmlSnippet(html: string) {
  return html.replace(/\s+/g, " ").trim().slice(0, 300);
}

function isHiddenCandidate($el: cheerio.Cheerio<any>) {
  const inputType = lower($el.attr("type") || "text");
  if (
    inputType === "hidden" ||
    inputType === "submit" ||
    inputType === "button" ||
    inputType === "image"
  ) {
    return true;
  }

  if ($el.attr("hidden") !== undefined) return true;
  if (lower($el.attr("aria-hidden")) === "true") return true;

  const style = lower($el.attr("style"));
  if (
    style.includes("display:none") ||
    style.includes("display: none") ||
    style.includes("visibility:hidden") ||
    style.includes("visibility: hidden")
  ) {
    return true;
  }

  return false;
}

function collectFormButtonTexts(
  $: cheerio.CheerioAPI,
  $form: cheerio.Cheerio<any>,
) {
  const texts = new Set<string>();

  $form.find("button, input[type='submit'], input[type='button']").each((_, el) => {
    const $el = $(el);
    if (isHiddenCandidate($el)) return;

    const text = norm(
      $el.is("input")
        ? $el.attr("value") || $el.attr("aria-label") || ""
        : $el.text() || $el.attr("aria-label") || "",
    );
    if (text) {
      texts.add(text);
    }
  });

  return [...texts];
}

function inspectVisibleFormCandidate(
  $: cheerio.CheerioAPI,
  formEl: any,
) {
  const $form = $(formEl);
  const fieldSummaries: Array<{
    name: string;
    id: string;
    label: string;
    placeholder: string;
    type: string;
  }> = [];
  let visibleInputCount = 0;
  let visibleTextareaCount = 0;
  let visibleSelectCount = 0;
  let visibleFileInputCount = 0;

  $form.find("input, textarea, select").each((_, el) => {
    const $el = $(el);
    if (isHiddenCandidate($el)) return;

    const tag = (($el.get(0) as any)?.tagName ?? "").toLowerCase();
    const rawType = lower($el.attr("type") || "text");
    const type = tag === "input" ? rawType : tag;
    const placeholder = norm($el.attr("placeholder") || $el.attr("aria-label") || "");
    const label = extractQuestionLabel($, $form, $el).replace(/\*/g, "").trim();
    const name = norm($el.attr("name") || "");
    const id = norm($el.attr("id") || "");

    if (tag === "textarea") {
      visibleTextareaCount += 1;
    } else if (tag === "select") {
      visibleSelectCount += 1;
    } else if (type === "file") {
      visibleInputCount += 1;
      visibleFileInputCount += 1;
    } else {
      visibleInputCount += 1;
    }

    fieldSummaries.push({
      name,
      id,
      label,
      placeholder,
      type,
    });
  });

  const buttonTexts = collectFormButtonTexts($, $form);
  const lowerButtonTexts = buttonTexts.map((text) => text.toLowerCase());
  const applicationLikeFields = fieldSummaries.filter((field) => {
    const combined = [field.name, field.id, field.label, field.placeholder, field.type]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return /(first name|firstname|last name|lastname|email|phone|resume|cv|location|linkedin|website|portfolio|work authorization|sponsorship|job_application|answers_attributes|candidate|applicant)/i.test(
      combined,
    );
  });
  const strongIdentityFieldCount = fieldSummaries.filter((field) => {
    const combined = [field.name, field.id, field.label, field.placeholder]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return /(first name|firstname|last name|lastname|email|phone|resume|cv)/i.test(
      combined,
    );
  }).length;
  const buttonLooksLikeApply = lowerButtonTexts.some((text) =>
    /(apply|submit)/i.test(text),
  );
  const fieldNames = fieldSummaries
    .map((field) =>
      inferFallbackFieldName({
        name: field.name,
        id: field.id,
        label: field.label,
        placeholder: field.placeholder,
        type: field.type,
      }),
    )
    .filter(Boolean);
  const reasonParts = [
    `application_like_fields:${applicationLikeFields.length}`,
    `visible_inputs:${visibleInputCount}`,
    `visible_textareas:${visibleTextareaCount}`,
    `visible_selects:${visibleSelectCount}`,
    `visible_file_inputs:${visibleFileInputCount}`,
    buttonLooksLikeApply ? "apply_button" : "no_apply_button",
  ];

  const acceptable =
    (applicationLikeFields.length >= 2 &&
      (buttonLooksLikeApply || strongIdentityFieldCount >= 2)) ||
    (strongIdentityFieldCount >= 3 && visibleFileInputCount >= 1);

  return {
    acceptable,
    reason: `fallback:visible_application_fields (${reasonParts.join(", ")})`,
    visibleInputCount,
    visibleTextareaCount,
    visibleSelectCount,
    visibleFileInputCount,
    selectedFormFieldNames: [...new Set(fieldNames)].slice(0, 25),
    selectedFormButtonTexts: [...new Set(buttonTexts)].slice(0, 10),
  };
}

function extractForm(
  $: cheerio.CheerioAPI,
  formEl: any,
  baseUrl: string,
  debug: GhParsedForm["debug"],
  options?: {
    allowGeneratedFieldNames?: boolean;
    parserMode?: "strict" | "fallback";
    selectedFormReason?: string;
    selectedFormFieldNames?: string[];
    selectedFormButtonTexts?: string[];
    selectedFormHasJobApplication?: boolean;
    fallbackFormParserUsed?: boolean;
    visibleInputCount?: number;
    visibleTextareaCount?: number;
    visibleSelectCount?: number;
    visibleFileInputCount?: number;
  },
): GhParsedForm {
  const $form = $(formEl);
  const rawAction = $form.attr("action") || "";
  const action = normalizeAction(rawAction, baseUrl);
  let method = safeMethod($form.attr("method"));
  if (method === "GET") method = "POST";

  const hidden: Record<string, string> = {};
  $form.find("input[type='hidden']").each((_, el) => {
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
      : { ...field, options: field.options ?? [] };

    fieldsByName.set(field.name, next);
    if (!orderedNames.includes(field.name)) orderedNames.push(field.name);
  };

  $form.find("input, textarea, select").each((_, el) => {
    const $el = $(el);
    const tag = (($el.get(0) as any)?.tagName ?? "").toLowerCase();
    const inputType = norm($el.attr("type") || "text").toLowerCase();
    const type = tag === "input" ? inputType : tag;

    if (type === "hidden" || type === "submit" || type === "button" || type === "image") return;

    const placeholder = norm($el.attr("placeholder") || "");
    const rawLabelWithMarks = extractQuestionLabel($, $form, $el).trim();
    const rawLabel = rawLabelWithMarks.replace(/\*/g, "").trim();
    const rawName = norm($el.attr("name") || "");
    const id = norm($el.attr("id") || "");
    const name = rawName || (
      options?.allowGeneratedFieldNames
        ? inferFallbackFieldName({
            name: rawName,
            id,
            label: rawLabel,
            placeholder,
            type,
          })
        : ""
    );
    if (!name) return;

    const label = rawLabel || placeholder || rawName || id || name;
    const isSecurityCodeField =
      rawName.toLowerCase().includes("security_code") ||
      id.toLowerCase().includes("security_code");
    const securityCodeRequiredByHint =
      /\*/.test(rawLabelWithMarks) || /required/i.test(placeholder) || /required/i.test(rawLabelWithMarks);
    const required = isSecurityCodeField
      ? isRequiredEl($el, rawLabelWithMarks || placeholder || rawName || name) || securityCodeRequiredByHint
      : isRequiredEl($el, rawLabelWithMarks || placeholder || rawName || name);
    const questionKey = rawName ? toQuestionKey(rawName) : undefined;

    if (type === "radio" || type === "checkbox") {
      const value = String($el.attr("value") ?? (type === "checkbox" ? "on" : ""));
      const optionLabel = optionLabelFromInput($, $el).replace(/\*/g, "").trim() || value || "Option";
      const current = fieldsByName.get(name);
      const options = dedupeOptions([...(current?.options ?? []), { value, label: optionLabel }]);
      upsertField({ name, type, label, placeholder, required, questionKey, options });
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

    upsertField({ name, type: tag === "textarea" ? "textarea" : type, label, placeholder, required, questionKey });
  });

  const fields: GhField[] = orderedNames
    .map((name) => fieldsByName.get(name))
    .filter((f): f is GhField => Boolean(f && f.type !== "hidden"))
    .map((f) => ({ ...f, label: f.label || f.placeholder || f.name, options: f.options ?? [] }));

  debug.pickedFormAction = action;
  debug.pickedFormMethod = method;
  debug.greenhouseParserMode = options?.parserMode ?? "strict";
  debug.selectedFormReason =
    options?.selectedFormReason ?? debug.selectedFormReason ?? debug.pickedFormReason;
  debug.selectedFormFieldNames =
    options?.selectedFormFieldNames ??
    fields.map((field) => field.name).slice(0, 25);
  debug.selectedFormButtonTexts =
    options?.selectedFormButtonTexts ?? collectFormButtonTexts($, $form);
  debug.fallbackFormParserUsed = options?.fallbackFormParserUsed ?? false;
  debug.visibleInputCount = options?.visibleInputCount ?? debug.visibleInputCount;
  debug.visibleTextareaCount =
    options?.visibleTextareaCount ?? debug.visibleTextareaCount;
  debug.visibleSelectCount = options?.visibleSelectCount ?? debug.visibleSelectCount;
  debug.visibleFileInputCount =
    options?.visibleFileInputCount ?? debug.visibleFileInputCount;
  debug.selectedFormHasJobApplication =
    options?.selectedFormHasJobApplication ??
    debug.selectedFormHasJobApplication;

  const rawActionNorm = norm(rawAction);
  if (!rawActionNorm) {
    debug.actionSuspicious = true;
    debug.actionSuspiciousReason = "missing_action";
  } else if (!/^https?:\/\//i.test(action)) {
    debug.actionSuspicious = true;
    debug.actionSuspiciousReason = "non_absolute_action";
  }

  return { action, method, hidden, fields, debug };
}

async function tryFetchHtml(url: string, note?: string): Promise<FetchHtmlResult> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    const finalUrl = res.url || url;
    const body = await res.text();
    const firstBytes = htmlSnippet(body);
    if (!res.ok) return { ok: false, status: res.status, url: finalUrl, html: "", note, firstBytes };
    return { ok: true, status: res.status, url: finalUrl, html: body, note, firstBytes };
  } catch (error: unknown) {
    return {
      ok: false,
      url,
      html: "",
      note: note ? `${note}: ${String(error)}` : String(error),
      firstBytes: "",
    };
  }
}

function extractIframeEmbedUrls($: cheerio.CheerioAPI, baseUrl: string) {
  const urls = new Set<string>();
  let iframeSrcFound: string | null = null;
  $("iframe[src]").each((_, iframe) => {
    const src = norm($(iframe).attr("src") || "");
    if (!src) return;
    if (
      src.includes("embed/job_app") ||
      src.includes("job_app?for=") ||
      src.includes("embed?for=") ||
      src.includes("job_applications")
    ) {
      if (!iframeSrcFound) iframeSrcFound = src;
      const abs = toAbsUrl(baseUrl, src);
      if (abs) urls.add(abs);
    }
  });
  return { urls: [...urls], iframeSrcFound };
}

function buildEmbedFallbackUrls(jobUrl: string) {
  const { board, jobId } = parseBoardAndJobId(jobUrl);
  if (!board || !jobId) return [];

  return [
    `https://boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(jobId)}`,
    `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(jobId)}`,
    `https://job-boards.eu.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(jobId)}`,
    `https://boards.greenhouse.io/embed/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}`,
    `https://job-boards.greenhouse.io/embed/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}`,
    `https://job-boards.eu.greenhouse.io/embed/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}`,
  ];
}

function buildEmbedJobAppUrl(jobUrl: string) {
  return buildEmbedFallbackUrls(jobUrl)[0];
}

function unique(list: string[]) {
  return [...new Set(list.filter(Boolean))];
}

function parseFromHtml(html: string, baseUrl: string, debug: GhParsedForm["debug"]): GhParsedForm | null {
  const $ = cheerio.load(html);
  const forms = $("form").toArray();
  const strictForms = forms.filter((formEl) => {
    const scope = $(formEl);
    return (
      hasJobApplicationInputs($, formEl) ||
      scope.find("input[name*='candidate' i], textarea[name*='candidate' i], select[name*='candidate' i]").length > 0
    );
  });
  const pickedForm = strictForms[0];

  debug.formCount = forms.length;
  if (pickedForm) {
    debug.pickedFormReason = `strict:application_like_fields (${strictForms.length}/${forms.length})`;
    debug.selectedFormReason = debug.pickedFormReason;
    debug.iframeUsed = baseUrl;
    debug.selectedFormHasJobApplication = true;

    const parsed = extractForm($, pickedForm, baseUrl, debug, {
      parserMode: "strict",
      selectedFormReason: debug.pickedFormReason,
      selectedFormHasJobApplication: true,
      fallbackFormParserUsed: false,
    });
    return {
      ...parsed,
      embedUrl: buildEmbedJobAppUrl(baseUrl),
    };
  }

  const fallbackCandidates = forms
    .map((formEl) => ({
      formEl,
      inspection: inspectVisibleFormCandidate($, formEl),
    }))
    .filter((candidate) => candidate.inspection.acceptable);
  const pickedFallback = fallbackCandidates[0];
  if (!pickedFallback) return null;

  debug.pickedFormReason = pickedFallback.inspection.reason;
  debug.selectedFormReason = pickedFallback.inspection.reason;
  debug.iframeUsed = baseUrl;
  debug.selectedFormHasJobApplication = false;

  const parsed = extractForm($, pickedFallback.formEl, baseUrl, debug, {
    allowGeneratedFieldNames: true,
    parserMode: "fallback",
    selectedFormReason: pickedFallback.inspection.reason,
    selectedFormFieldNames: pickedFallback.inspection.selectedFormFieldNames,
    selectedFormButtonTexts: pickedFallback.inspection.selectedFormButtonTexts,
    selectedFormHasJobApplication: false,
    fallbackFormParserUsed: true,
    visibleInputCount: pickedFallback.inspection.visibleInputCount,
    visibleTextareaCount: pickedFallback.inspection.visibleTextareaCount,
    visibleSelectCount: pickedFallback.inspection.visibleSelectCount,
    visibleFileInputCount: pickedFallback.inspection.visibleFileInputCount,
  });
  return {
    ...parsed,
    embedUrl: buildEmbedJobAppUrl(baseUrl),
  };
}

export async function parseGreenhouseForm(jobUrl: string): Promise<GhParsedForm> {
  const embedUrl = buildEmbedJobAppUrl(jobUrl);
  const altUrl = alternateHostUrl(jobUrl);
  const jobPageCandidates = unique([jobUrl, altUrl]);

  const debug: GhParsedForm["debug"] = {
    jobPagesTried: [],
    embedTried: [],
    iframeSrcFound: null,
  };
  const embedCandidates: string[] = [];

  for (const jobPageUrl of jobPageCandidates) {
    const fetched = await tryFetchHtml(jobPageUrl, "job_page");
    debug.jobPagesTried.push({ url: fetched.url, status: fetched.status, ok: fetched.ok, note: fetched.note });
    if (!fetched.ok) continue;

    debug.firstBytesJobPage = fetched.firstBytes;

    const $ = cheerio.load(fetched.html);
    debug.formsFoundOnJobPage = $("form").length;

    const iframeInfo = extractIframeEmbedUrls($, fetched.url);
    debug.iframeSrcFound = iframeInfo.iframeSrcFound;
    embedCandidates.push(...iframeInfo.urls);
    embedCandidates.push(...buildEmbedFallbackUrls(fetched.url));

    const parsedPage = parseFromHtml(fetched.html, fetched.url, {
      ...debug,
    });
    if (parsedPage) {
      parsedPage.debug.jobPagesTried = debug.jobPagesTried;
      parsedPage.debug.embedTried = debug.embedTried;
      parsedPage.embedUrl = embedUrl;
      return parsedPage;
    }
  }

  const embedTried = unique(embedCandidates);

  for (const embedUrl of embedTried) {
    const fetched = await tryFetchHtml(embedUrl, "embed_candidate");
    debug.embedTried.push({ url: fetched.url, status: fetched.status, ok: fetched.ok, note: fetched.note });
    if (!fetched.ok) continue;

    debug.firstBytesEmbed = fetched.firstBytes;
    const embed$ = cheerio.load(fetched.html);
    debug.formsFoundOnEmbed = embed$("form").length;

    const parsed = parseFromHtml(fetched.html, fetched.url, {
      ...debug,
    });

    if (parsed) {
      parsed.debug.embedTried = debug.embedTried;
      parsed.debug.jobPagesTried = debug.jobPagesTried;
      parsed.embedUrl = embedUrl;
      return parsed;
    }
  }

  throw new Error("No application form found. DEBUG=" + JSON.stringify(debug));
}
