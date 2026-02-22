// my-app/app/lib/greenhouse/parseGreenhouseForm.ts
import * as cheerio from "cheerio";

export type GhField = {
  name: string;
  type: string; // text | email | tel | textarea | select | file | radio | checkbox | hidden | etc.
  label: string;
  required: boolean;
  placeholder?: string;
  questionKey?: string;
  options?: Array<{ value: string; label: string }>; // for select/radio/checkbox
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

function looksLikeGreenhouseApplicationForm($form: cheerio.Cheerio) {
  const action = norm($form.attr("action") || "");
  const hasFile = $form.find("input[type='file']").length > 0;
  const hasEmail = $form.find("input[type='email'], input[name*='email' i]").length > 0;
  const hasName =
    $form.find("input[name*='first' i], input[name*='last' i], input[name*='name' i]").length >
    0;

  const actionLooks =
    /applications|apply|job_application|candidate/i.test(action) || /greenhouse/i.test(action);

  const hasGhFieldNames =
    $form.find(
      "input[name*='job_application' i], input[name*='candidate' i], input[name*='question' i]"
    ).length > 0;

  const inputCount = $form.find("input, textarea, select").length;

  let score = 0;
  if (hasFile) score += 5;
  if (actionLooks) score += 3;
  if (hasGhFieldNames) score += 3;
  if (hasEmail) score += 2;
  if (hasName) score += 1;
  if (inputCount >= 8) score += 2;

  return { score, action, hasFile, inputCount };
}

function findBestForm($: cheerio.CheerioAPI) {
  const forms = $("form").toArray();
  let best: { el: cheerio.Element; score: number; reason: string } | null = null;

  for (const el of forms) {
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

  if (!best && forms.length > 0) {
    best = { el: forms[0], score: 0, reason: "fallback:first_form" };
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

function extractForm(
  $: cheerio.CheerioAPI,
  formEl: cheerio.Element,
  baseUrl: string,
  debug: GhParsedForm["debug"]
) {
  const $form = $(formEl);

  const rawAction = norm($form.attr("action") || "");
  const action = rawAction ? toAbsUrl(baseUrl, rawAction) : baseUrl;

  const method = safeMethod($form.attr("method"));

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

/**
 * Main entry
 */
export async function parseGreenhouseForm(jobUrl: string): Promise<GhParsedForm> {
  const res = await fetch(jobUrl, {
    cache: "no-store",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      accept: "text/html",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load job page: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const debug: GhParsedForm["debug"] = {
    pickedFormReason: "",
    formCount: $("form").length,
    iframeUsed: null,
  };

  const best = findBestForm($);

  const shouldTryIframe =
    !best ||
    best.score < 3 ||
    ($(best.el).find("input, textarea, select").length < 6 && $("iframe").length > 0);

  if (shouldTryIframe) {
    const iframeSrc =
      $("iframe[src*='embed/job_app']").attr("src") ||
      $("iframe[src*='job_app']").attr("src") ||
      $("iframe[src*='greenhouse']").attr("src") ||
      $("iframe").first().attr("src") ||
      "";

    if (iframeSrc) {
      const iframeUrl = toAbsUrl(jobUrl, iframeSrc);
      debug.iframeUsed = iframeUrl;

      const iframeRes = await fetch(iframeUrl, { cache: "no-store" });
      if (iframeRes.ok) {
        const iframeHtml = await iframeRes.text();
        const $$ = cheerio.load(iframeHtml);

        const iframeBest = findBestForm($$);
        if (iframeBest) {
          debug.pickedFormReason = `iframe:${iframeBest.reason}`;
          const parsedIframe = extractForm($$, iframeBest.el, iframeUrl, debug);

          if (parsedIframe.fields.length > 0 && parsedIframe.method !== "GET") {
            return parsedIframe;
          }
        }
      }
    }
  }

  if (!best) {
    throw new Error("No form detected on job page (and no usable iframe).");
  }

  debug.pickedFormReason = `page:${best.reason}`;
  const parsedPage = extractForm($, best.el, jobUrl, debug);

  if (parsedPage.method === "GET" || parsedPage.fields.length === 0) {
    const embedUrl = buildEmbedJobAppUrl(jobUrl);

    if (embedUrl) {
      try {
        const embedRes = await fetch(embedUrl, { cache: "no-store" });
        if (embedRes.ok) {
          const embedHtml = await embedRes.text();
          const $$ = cheerio.load(embedHtml);

          const fallbackForm = $$("form").first().get(0);
          const embedBest = findBestForm($$) ??
            (fallbackForm
              ? { el: fallbackForm, score: 0, reason: "fallback:embed:first_form" }
              : null);
          if (embedBest?.el) {
            const embedDebug: GhParsedForm["debug"] = {
              pickedFormReason: `embed:${embedBest.reason}`,
              formCount: $$("form").length,
              iframeUsed: embedUrl,
            };

            const parsedEmbed = extractForm($$, embedBest.el, embedUrl, embedDebug);

            if (parsedEmbed.fields.length > 0) {
              return parsedEmbed;
            }
          }
        }
      } catch {
        // ignore embed fetch errors and fall back to parsedPage
      }
    }
  }

  return parsedPage;
}
