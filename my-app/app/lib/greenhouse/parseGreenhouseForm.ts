import * as cheerio from "cheerio";

export type ParsedFormFieldOption = {
  value: string;
  label: string;
};

export type ParsedFormField = {
  name: string;
  type: string;
  required: boolean;
  label: string;
  placeholder: string;
  options?: ParsedFormFieldOption[];
};

export type ParsedGreenhouseForm = {
  action: string;
  method: string;
  hidden: Record<string, string>;
  fields: ParsedFormField[];
};

function normalizeText(value: string | undefined | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toAbsoluteUrl(value: string | undefined, baseUrl: string) {
  const input = normalizeText(value);
  if (!input) return "";

  try {
    return new URL(input, baseUrl).toString();
  } catch {
    return input;
  }
}

async function fetchHtml(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch Greenhouse page (${res.status}).`);
  }

  return await res.text();
}

function getLabel($: cheerio.CheerioAPI, field: cheerio.Cheerio<cheerio.Element>, form: cheerio.Cheerio<cheerio.Element>) {
  const id = normalizeText(field.attr("id"));
  const byFor = id ? normalizeText(form.find(`label[for='${id}']`).first().text()) : "";

  if (byFor) return byFor;

  const parentLabel = normalizeText(field.closest("label").first().text());
  if (parentLabel) return parentLabel;

  const nearbyLabel = normalizeText(field.parent().find("label").first().text());
  if (nearbyLabel) return nearbyLabel;

  const aria = normalizeText(field.attr("aria-label"));
  if (aria) return aria;

  const placeholder = normalizeText(field.attr("placeholder"));
  if (placeholder) return placeholder;

  return normalizeText(field.attr("name"));
}

function isFieldRequired(field: cheerio.Cheerio<cheerio.Element>, label: string) {
  const attrRequired = field.is("[required]");
  const ariaRequired = normalizeText(field.attr("aria-required")).toLowerCase() === "true";
  const labelHasStar = label.includes("*");
  return attrRequired || ariaRequired || labelHasStar;
}

function parseForm(html: string, baseUrl: string): ParsedGreenhouseForm {
  const $ = cheerio.load(html);

  const iframeSrc =
    $("iframe[src*='greenhouse.io']").attr("src") ||
    $("iframe[src*='boards.greenhouse.io']").attr("src") ||
    "";

  const form = $("form").filter((_, el) => {
    const action = normalizeText($(el).attr("action"));
    return action.includes("greenhouse") || $(el).find("input,select,textarea").length > 0;
  }).first();

  const activeForm = form.length ? form : $("form").first();

  if (!activeForm.length) {
    throw new Error(iframeSrc ? "No application form found on parent page." : "No application form found.");
  }

  const action = toAbsoluteUrl(activeForm.attr("action"), baseUrl);
  const method = normalizeText(activeForm.attr("method") || "POST").toUpperCase();

  const hidden: Record<string, string> = {};
  activeForm.find("input[type='hidden'][name]").each((_, input) => {
    const el = $(input);
    const name = normalizeText(el.attr("name"));
    if (!name) return;
    hidden[name] = normalizeText(el.attr("value"));
  });

  const fields: ParsedFormField[] = [];

  activeForm.find("input[name],select[name],textarea[name]").each((_, rawField) => {
    const field = $(rawField);
    const name = normalizeText(field.attr("name"));
    if (!name) return;

    const tagName = String(rawField.tagName || "").toLowerCase();
    const type = tagName === "input" ? normalizeText(field.attr("type") || "text").toLowerCase() : tagName;

    if (type === "hidden") return;

    const label = getLabel($, field, activeForm);
    const required = isFieldRequired(field, label);
    const placeholder = normalizeText(field.attr("placeholder"));

    const entry: ParsedFormField = {
      name,
      type,
      label,
      required,
      placeholder,
    };

    if (tagName === "select") {
      entry.options = field
        .find("option")
        .map((__, option) => {
          const optionEl = $(option);
          return {
            value: normalizeText(optionEl.attr("value")),
            label: normalizeText(optionEl.text()),
          };
        })
        .get()
        .filter((option) => option.value || option.label);
    }

    fields.push(entry);
  });

  if (!action) {
    throw new Error("Greenhouse form action URL is missing.");
  }

  return { action, method, hidden, fields };
}

export async function parseGreenhouseForm(jobUrl: string): Promise<ParsedGreenhouseForm> {
  const pageHtml = await fetchHtml(jobUrl);
  const $ = cheerio.load(pageHtml);
  const iframeSrc =
    $("iframe[src*='greenhouse.io']").attr("src") ||
    $("iframe[src*='boards.greenhouse.io']").attr("src") ||
    "";

  if (iframeSrc) {
    const iframeUrl = toAbsoluteUrl(iframeSrc, jobUrl);
    const iframeHtml = await fetchHtml(iframeUrl);
    return parseForm(iframeHtml, iframeUrl);
  }

  return parseForm(pageHtml, jobUrl);
}
