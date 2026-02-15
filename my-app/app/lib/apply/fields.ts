export type ApplyFieldKey =
  | "fullName"
  | "email"
  | "phone"
  | "location"
  | "workAuth"
  | "linkedin"
  | "portfolio";

export type ApplyField = {
  key: ApplyFieldKey;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "email" | "tel" | "url";
};

export const APPLY_FIELDS: ApplyField[] = [
  { key: "fullName", label: "Full name", placeholder: "Kevin Baxter", required: true, type: "text" },
  { key: "email", label: "Email", placeholder: "you@email.com", required: true, type: "email" },
  { key: "phone", label: "Phone", placeholder: "(313) 555-1234", required: true, type: "tel" },
  { key: "location", label: "Location", placeholder: "Detroit, MI", required: true, type: "text" },
  { key: "workAuth", label: "Work authorization", placeholder: "US Citizen / Green Card / Visa...", required: true, type: "text" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/...", required: false, type: "url" },
  { key: "portfolio", label: "Portfolio (optional)", placeholder: "https://...", required: false, type: "url" },
];

export function getMissingFields(prefill: Record<string, any>) {
  return APPLY_FIELDS.filter((f) => f.required && !String(prefill[f.key] ?? "").trim());
}
