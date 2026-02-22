// my-app/app/lib/greenhouse/parseGreenhouseForm.ts
import * as cheerio from "cheerio";

export type GhField = {
  name: string;
  type: string; // text | email | tel | textarea | select | file | radio | checkbox | hidden | etc.
  label: string;
  required: boolean;
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

function looksLikeGreenhouseApplicationForm($form: cheerio.Cheerio, $: cheerio.CheerioAPI) {
  // Strong signals: file upload, application-ish action, greenhouse field names
  const action = norm($form.attr("action") || "");
  const hasFile = $form.find("input[type='file']").length > 0;
  const hasEmail = $form.find("input[type='email'], input[name*='email' i]").length > 0;
  const hasName =
    $form.find("input[name*='first' i], input[name*='last' i], input[name*='name' i]").length > 0;

  const actionLooks =
    /applications|apply|job_application|candidate/i.test(action) ||
    /greenhouse/i.test(action);

  const hasGhFieldNames =
    $form.find("input[name*='job_application' i], input[name*='candidate' i], input[name*='question' i]").length > 0;

  // A "real" greenhouse apply form almost always has inputs beyond just search.
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
    const { score, action, hasFile, inputCount } = looksLikeGreenhouseApplicationForm($form, $);

    // ignore obvious non-application forms
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

  // fallback: first form if nothing scored
  if (!best && forms.length > 0) {
    best = { el: forms[0], score: 0, reason: "fallback:first_form" };
  }

  return best;
}

function getLabelFor(
  $: cheerio.CheerioAPI,
  $form: cheerio.Cheerio,
  $el: cheerio.Cheerio
) {
  const id = norm($el.attr("id") || "");
  const aria = norm($el.attr("aria-label") || "");
  const ph = norm($el.attr("placeholder") || "");
  const name = norm($el.attr("name") || "");

  // 1) label[for=id]
  if (id) {
    const lbl = norm($form.find(`label[for="${id}"]`).first().text());
    if (lbl) return lbl;
  }

  // 2) closest label in same group/container
  const closest = norm(
    $el
      .closest("li, div, fieldset, section, label")
      .find("label")
      .first()
      .text()
  );
  if (closest) return closest;

  // 3) fieldset legend
  const legend = norm($el.closest("fieldset").find("legend").first().text());
  if (legend) return legend;

  // 4) aria-label / placeholder / name
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

  // some GH uses data-required
  const dataReq = norm($el.attr("data-required") || "");
  if (dataReq === "true" || dataReq === "required") return true;

  // label contains * or "required"
  if (guessRequiredFromLabel(label)) return true;

  return false;
}

function extractForm($: cheerio.CheerioAPI, formEl: cheerio.Element, baseUrl: string, debug: GhParsedForm["debug"]) {
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

  // We'll collect primitives + group radios/checkboxes by name
  const fieldsByName = new Map<string, GhField>();
  const radioGroups = new Map<
    string,
    { label: string; required: boolean; options: Array<{ value: string; label: string }> }
  >();
  const checkboxGroups = new Map<
    string,
    { label: string; required: boolean; options: Array<{ value: string; label: string }> }
  >();

  // INPUTS
  $form.find("input").each((_, el) => {
    const $el = $(el);
    const type = norm($el.attr("type") || "text").toLowerCase();

    if (type === "hidden" || type === "submit" || type === "button" || type === "image") return;

    const name = norm($el.attr("name") || "");
    if (!name) return;

    const label = getLabelFor($, $form, $el).replace(/\*/g, "").trim();
    const required = isRequiredEl($el, label);

    if (type === "radio") {
      const value = String($el.attr("value") ?? "");
      // label for radio option: try nearest label text
      const optLabel =
        norm($el.closest("label").text()) ||
        norm($el.parent().find("label").first().text()) ||
        value ||
        "Option";

      const group = radioGroups.get(name) ?? {
        label: label || name,
        required,
        options: [],
      };
      group.required = group.required || required;
      group.options.push({ value, label: optLabel.replace(/\*/g, "").trim() || value });
      radioGroups.set(name, group);
      return;
    }

    if (type === "checkbox") {
      const value = String($el.attr("value") ?? "on");
      const optLabel =
        norm($el.closest("label").text()) ||
        norm($el.parent().find("label").first().text()) ||
        value ||
        "Option";

      const group = checkboxGroups.get(name) ?? {
        label: label || name,
        required,
        options: [],
      };
      group.required = group.required || required;
      group.options.push({ value, label: optLabel.replace(/\*/g, "").trim() || value });
      checkboxGroups.set(name, group);
      return;
    }

    // normal input
    fieldsByName.set(name, {
      name,
      type,
      label,
      required,
    });
  });

  // TEXTAREAS
  $form.find("textarea").each((_, el) => {
    const $el = $(el);
    const name = norm($el.attr("name") || "");
    if (!name) return;

    const label = getLabelFor($, $form, $el).replace(/\*/g, "").trim();
    const required = isRequiredEl($el, label);

    fieldsByName.set(name, {
      name,
      type: "textarea",
      label,
      required,
    });
  });

  // SELECTS
  $form.find("select").each((_, el) => {
    const $el = $(el);
    const name = norm($el.attr("name") || "");
    if (!name) return;

    const label = getLabelFor($, $form, $el).replace(/\*/g, "").trim();
    const required = isRequiredEl($el, label);

    const options: Array<{ value: string; label: string }> = [];
    $el.find("option").each((__, opt) => {
      const $opt = $(opt);
      options.push({
        value: String($opt.attr("value") ?? ""),
        label: norm($opt.text()),
      });
    });

    fieldsByName.set(name, {
      name,
      type: "select",
      label,
      required,
      options,
    });
  });

  // Merge radio/checkbox groups into fieldsByName
  for (const [name, g] of radioGroups.entries()) {
    // de-dupe options by value
    const seen = new Set<string>();
    const options = g.options.filter((o) => {
      const k = `${o.value}|${o.label}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    fieldsByName.set(name, {
      name,
      type: "radio",
      label: g.label,
      required: g.required,
      options,
    });
  }

  for (const [name, g] of checkboxGroups.entries()) {
    const seen = new Set<string>();
    const options = g.options.filter((o) => {
      const k = `${o.value}|${o.label}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    fieldsByName.set(name, {
      name,
      type: "checkbox",
      label: g.label,
      required: g.required,
      options,
    });
  }

  // Final list: keep stable order by DOM appearance when possible
  const orderedNames: string[] = [];
  $form.find("input, textarea, select").each((_, el) => {
    const name = norm($(el).attr("name") || "");
    if (!name) return;
    if (!orderedNames.includes(name)) orderedNames.push(name);
  });

  const fields: GhField[] = [];
  for (const name of orderedNames) {
    const f = fieldsByName.get(name);
    if (!f) continue;
    if (f.type === "hidden") continue;
    fields.push(f);
  }

  // If nothing found, fall back to all map values
  if (fields.length === 0) {
    fields.push(...Array.from(fieldsByName.values()));
  }

  debug.pickedFormAction = action;
  debug.pickedFormMethod = method;

  return { action, method, hidden, fields, debug };
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

  // 1) Try best form on the page
  const best = findBestForm($);

  // 2) If no good form, or it looks empty-ish, try iframe
  const shouldTryIframe =
    !best ||
    best.score < 3 ||
    ($(best.el).find("input, textarea, select").length < 6 &&
      $("iframe").length > 0);

  if (shouldTryIframe) {
    const iframeSrc =
      $("iframe[src*='greenhouse']").attr("src") ||
      $("iframe[src*='job_app']").attr("src") ||
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
          return extractForm($$, iframeBest.el, iframeUrl, debug);
        }
      }
    }
  }

  if (!best) {
    throw new Error("No form detected on job page (and no usable iframe).");
  }

  debug.pickedFormReason = `page:${best.reason}`;
  return extractForm($, best.el, jobUrl, debug);
}