function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizePhoneForSms(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (raw.startsWith("+")) {
    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length >= 8 && digits.length <= 15) {
      return `+${digits}`;
    }
    return null;
  }

  const digits = digitsOnly(raw);
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
}

export function formatPhoneForDisplay(value: unknown) {
  const normalized = normalizePhoneForSms(value);
  if (!normalized) return null;

  const digits = normalized.slice(1);
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return normalized;
}

export function maskPhoneForDisplay(value: unknown) {
  const normalized = normalizePhoneForSms(value);
  if (!normalized) return null;

  const digits = normalized.slice(1);
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (***) ***-${digits.slice(-4)}`;
  }

  if (digits.length <= 4) {
    return normalized;
  }

  return `+${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}
