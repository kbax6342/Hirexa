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
    embedTried: string[];
    jobPagesTried: string[];
    selectedFormHasJobApplication: boolean;
  };
};

type GhOption = { value: string; label: string };

type FetchHtmlResult =
  | { ok: true; url: string; html: string }
  | { ok: false; url: string; html: "" };

function norm(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
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

  if (aria) return aria;
  if (ph) return ph;
  if (name) return name;

  return "Field";
}

function isRequiredEl($el: cheerio.Cheerio, label: string) {
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

function optionLabelFromInput($: cheerio.CheerioAPI, $optEl: cheerio.Cheerio) {
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
    if (u.hostname.startsWith("boards.greenhouse.io")) {
      u.hostname = "job-boards.greenhouse.io";
      return u.toString();
    }
    return "";
  } catch {
    return "";
  }
}

function hasJobApplicationInputs($: cheerio.CheerioAPI, formEl: cheerio.Element) {
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

function extractForm(
  $: cheerio.CheerioAPI,
  formEl: cheerio.Element,
  baseUrl: string,
  debug: GhParsedForm["debug"]
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

async function tryFetchHtml(url: string): Promise<FetchHtmlResult> {
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

  if (!res.ok) return { ok: false, url: res.url || url, html: "" };
  return { ok: true, url: res.url || url, html: await res.text() };
}

function extractIframeEmbedUrls($: cheerio.CheerioAPI, baseUrl: string) {
  const urls = new Set<string>();
  $("iframe[src]").each((_, iframe) => {
    const src = norm($(iframe).attr("src") || "");
    if (!src) return;
    if (src.includes("/embed/job_app") || src.includes("job_app?for=")) {
      const abs = toAbsUrl(baseUrl, src);
      if (abs) urls.add(abs);
    }
  });
  return [...urls];
}

function buildEmbedFallbackUrls(jobUrl: string) {
  const { board, jobId } = parseBoardAndJobId(jobUrl);
  if (!board || !jobId) return [];

  return [
    `https://boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(jobId)}`,
    `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(jobId)}`,
  ];
}

function unique(list: string[]) {
  return [...new Set(list.filter(Boolean))];
}

function parseFromHtml(html: string, baseUrl: string, debug: GhParsedForm["debug"]): GhParsedForm | null {
  const $ = cheerio.load(html);
  const forms = $("form").toArray();
  const strictForms = forms.filter((formEl) => hasJobApplicationInputs($, formEl));
  const pickedForm = strictForms[0];

  if (!pickedForm) return null;

  debug.formCount = forms.length;
  debug.pickedFormReason = `strict:job_application_fields (${strictForms.length}/${forms.length})`;
  debug.iframeUsed = baseUrl;
  debug.selectedFormHasJobApplication = true;

  return extractForm($, pickedForm, baseUrl, debug);
}

export async function parseGreenhouseForm(jobUrl: string): Promise<GhParsedForm> {
  const altUrl = alternateHostUrl(jobUrl);
  const jobPagesTried = unique([jobUrl, altUrl]);

  const embedCandidates: string[] = [];

  for (const jobPageUrl of jobPagesTried) {
    const fetched = await tryFetchHtml(jobPageUrl);
    if (!fetched.ok) continue;

    const $ = cheerio.load(fetched.html);
    embedCandidates.push(...extractIframeEmbedUrls($, fetched.url));
    embedCandidates.push(...buildEmbedFallbackUrls(fetched.url));

    const parsedPage = parseFromHtml(fetched.html, fetched.url, {
      pickedFormReason: "",
      formCount: 0,
      embedTried: [],
      jobPagesTried,
      selectedFormHasJobApplication: false,
    });
    if (parsedPage) {
      parsedPage.debug.jobPagesTried = jobPagesTried;
      parsedPage.debug.embedTried = unique(embedCandidates);
      return parsedPage;
    }
  }

  const embedTried = unique(embedCandidates);

  for (const embedUrl of embedTried) {
    const fetched = await tryFetchHtml(embedUrl);
    if (!fetched.ok) continue;

    const parsed = parseFromHtml(fetched.html, fetched.url, {
      pickedFormReason: "",
      formCount: 0,
      embedTried,
      jobPagesTried,
      selectedFormHasJobApplication: false,
    });

    if (parsed) {
      parsed.debug.embedTried = embedTried;
      parsed.debug.jobPagesTried = jobPagesTried;
      return parsed;
    }
  }

  throw new Error("No application form found after trying job page + embed on both hosts.");
}
