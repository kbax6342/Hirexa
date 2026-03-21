import "server-only";

import { getSiteUrl } from "@/app/lib/site-url";

const DEFAULT_FROM_ADDRESS = "support@hirexa-ai.com";
const DEFAULT_FROM_NAME = "Hirexa AI";
const DEFAULT_SENDING_DOMAIN = "hirexa-ai.com";

type ParsedLegacySender = {
  address: string | null;
  name: string | null;
};

function normalizeText(value: string | undefined | null) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

function parseLegacySender(value: string | null) {
  const raw = normalizeText(value);
  if (!raw) {
    return { address: null, name: null } satisfies ParsedLegacySender;
  }

  const match = raw.match(/^(.*)<([^>]+)>$/);
  if (match) {
    const name = normalizeText(match[1]?.replace(/^"|"$/g, ""));
    const address = normalizeText(match[2]);
    return { address, name } satisfies ParsedLegacySender;
  }

  if (raw.includes("@")) {
    return { address: raw, name: null } satisfies ParsedLegacySender;
  }

  return { address: null, name: null } satisfies ParsedLegacySender;
}

function getLegacySender() {
  return parseLegacySender(
    process.env.EMAIL_FROM?.trim() || process.env.SENDGRID_FROM?.trim() || null
  );
}

export function getEmailConfig() {
  const legacySender = getLegacySender();
  const fromAddress =
    normalizeText(process.env.EMAIL_FROM_ADDRESS) ??
    legacySender.address ??
    DEFAULT_FROM_ADDRESS;
  const fromName =
    normalizeText(process.env.EMAIL_FROM_NAME) ??
    legacySender.name ??
    DEFAULT_FROM_NAME;
  const sendingDomain =
    normalizeText(process.env.EMAIL_SENDING_DOMAIN) ??
    fromAddress.split("@")[1] ??
    DEFAULT_SENDING_DOMAIN;
  const replyTo =
    normalizeText(process.env.EMAIL_REPLY_TO) ??
    normalizeText(process.env.EMAIL_SUPPORT) ??
    undefined;
  const supportEmail =
    normalizeText(process.env.EMAIL_SUPPORT) ??
    normalizeText(process.env.EMAIL_REPLY_TO) ??
    undefined;

  return {
    from: `${fromName} <${fromAddress}>`,
    fromAddress,
    fromName,
    sendingDomain,
    replyTo,
    supportEmail,
    appUrl: getSiteUrl(),
  };
}

export function getLoopsConfig() {
  const apiKey = normalizeText(process.env.LOOPS_API_KEY);
  const transactionalApiKey = normalizeText(process.env.LOOPS_TRANSACTIONAL_API_KEY);

  return {
    apiKey,
    transactionalApiKey,
    audienceEnabled: Boolean(apiKey),
    transactionalEnabled: Boolean(transactionalApiKey ?? apiKey),
  };
}
