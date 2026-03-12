import DOMPurify from "isomorphic-dompurify";
import type { JobDetail } from "./types";
import { decodeHtml } from "@/app/lib/utils/decodeHtml";

const HEADING_PATTERN =
  /^(description|requirements|responsibilities|coverage time|qualifications|duties|benefits|how to apply|summary|overview|about|about the team|about the role|role overview|what you'll do|what you ll do|what you'll bring|what you bring|preferred qualifications|minimum qualifications):?$/i;
const INLINE_LABEL_PATTERN = /^([A-Z][A-Za-z0-9/&(),'\- ]{1,40}):\s+(.+)$/;
const UNORDERED_LIST_PATTERN = /^[-*\u2022]\s+(.+)$/;
const ORDERED_LIST_PATTERN = /^\d+[\.\)]\s+(.+)$/;
const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+)/gi;

function looksLikeHtml(value: string | null | undefined) {
  return Boolean(value && /<[^>]+>/.test(value));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value: string | null | undefined) {
  return decodeHtml(String(value ?? ""))
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .trim();
}

function renderInlineText(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  let lastIndex = 0;
  let rendered = "";

  for (const match of normalized.matchAll(URL_PATTERN)) {
    const found = match[0];
    const index = match.index ?? 0;
    rendered += escapeHtml(normalized.slice(lastIndex, index));
    const href = found.startsWith("http") ? found : `https://${found}`;
    rendered += `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(found)}</a>`;
    lastIndex = index + found.length;
  }

  rendered += escapeHtml(normalized.slice(lastIndex));
  return rendered;
}

function sanitizeJobDetailHtml(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "a",
      "article",
      "blockquote",
      "br",
      "div",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "i",
      "li",
      "ol",
      "p",
      "section",
      "span",
      "strong",
      "u",
      "ul",
    ],
    ALLOWED_ATTR: ["href", "rel", "target"],
  });
}

function renderPlainTextAsHtml(text: string) {
  const lines = normalizeText(text).split("\n");
  const blocks: string[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    blocks.push(
      `<p>${paragraphLines.map((line) => renderInlineText(line)).join("<br />")}</p>`
    );
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (!listItems.length || !listType) return;
    blocks.push(
      `<${listType}>${listItems
        .map((item) => `<li>${renderInlineText(item)}</li>`)
        .join("")}</${listType}>`
    );
    listItems.length = 0;
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const unorderedMatch = line.match(UNORDERED_LIST_PATTERN);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(unorderedMatch[1]);
      continue;
    }

    const orderedMatch = line.match(ORDERED_LIST_PATTERN);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(orderedMatch[1]);
      continue;
    }

    flushList();

    if (HEADING_PATTERN.test(line)) {
      flushParagraph();
      blocks.push(`<h3>${escapeHtml(line.replace(/:$/, ""))}</h3>`);
      continue;
    }

    const inlineLabelMatch = line.match(INLINE_LABEL_PATTERN);
    if (inlineLabelMatch && inlineLabelMatch[1].split(/\s+/).length <= 5) {
      flushParagraph();
      blocks.push(
        `<p><strong>${escapeHtml(inlineLabelMatch[1])}:</strong> ${renderInlineText(
          inlineLabelMatch[2]
        )}</p>`
      );
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks.join("\n");
}

function renderSupplementalSections(detail: JobDetail) {
  const sections: string[] = [];

  const addListSection = (title: string, items?: string[] | null) => {
    const safeItems = (items ?? []).map((item) => normalizeText(item)).filter(Boolean);
    if (!safeItems.length) return;
    sections.push(
      `<section><h3>${escapeHtml(title)}</h3><ul>${safeItems
        .map((item) => `<li>${renderInlineText(item)}</li>`)
        .join("")}</ul></section>`
    );
  };

  addListSection("Requirements", detail.requirements);
  addListSection("Responsibilities", detail.duties);
  addListSection("Benefits", detail.benefits);
  addListSection("How To Apply", detail.howToApply);

  return sections.join("\n");
}

export function buildJobDetailBodyHtml(detail: JobDetail | null) {
  if (!detail) return null;

  const candidates = [
    detail.descriptionHtml,
    detail.contentHtml,
    detail.content,
    detail.description,
    detail.descriptionPlain,
    detail.summary,
    detail.snippet,
  ];

  let baseHtml = "";
  let usedRichHtml = false;

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (!normalized) continue;

    if (looksLikeHtml(candidate) || looksLikeHtml(normalized)) {
      baseHtml = normalized;
      usedRichHtml = true;
      break;
    }

    baseHtml = renderPlainTextAsHtml(normalized);
    break;
  }

  const supplementalHtml = usedRichHtml ? "" : renderSupplementalSections(detail);
  const combined = [baseHtml, supplementalHtml].filter(Boolean).join("\n");

  if (!combined) return null;
  return sanitizeJobDetailHtml(combined);
}
