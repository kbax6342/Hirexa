// /app/lib/salary.ts
export const SALARY_BOUNDS = {
  yearly: { min: 20000, max: 200000 },
  hourly: { min: 10, max: 200 },
} as const;

export type CompensationType = "yearly" | "hourly";

export function parseSalaryInputToNumber(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input) : null;
  }

  const raw = String(input).replace(/[^\d.-]/g, "");
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

export function clampSalaryForType(value: number, type: CompensationType) {
  const bounds = SALARY_BOUNDS[type];
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

export function formatSalary(amount: number | null | undefined, type: CompensationType) {
  if (!Number.isFinite(amount ?? NaN)) return "Not set";
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount as number);
  return `${formatted}/${type === "hourly" ? "hour" : "year"}`;
}
