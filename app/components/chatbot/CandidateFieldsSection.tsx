"use client";

import { Checkbox } from "@/app/components/ui/checkbox";
import type { CompanyChatbotInput } from "@/lib/chatbot/types";
import {
  OPTIONAL_CANDIDATE_FIELD_OPTIONS,
  REQUIRED_CANDIDATE_FIELD_OPTIONS,
} from "@/lib/chatbot/types";

type CandidateFieldsSectionProps = {
  form: CompanyChatbotInput;
  fieldErrors?: Record<string, string>;
  update: (patch: Partial<CompanyChatbotInput>) => void;
};

function fieldLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function toggleValue(values: string[], value: string, checked: boolean) {
  return checked
    ? [...new Set([...values, value])]
    : values.filter((item) => item !== value);
}

export default function CandidateFieldsSection({
  form,
  fieldErrors,
  update,
}: CandidateFieldsSectionProps) {
  return (
    <div className="grid gap-6">
      <div>
        <h3 className="text-sm font-semibold text-black">
          Required candidate fields
        </h3>
        {fieldErrors?.requiredCandidateFields ? (
          <p className="mt-1 text-xs text-red-600">
            {fieldErrors.requiredCandidateFields}
          </p>
        ) : null}
        <div className="mt-3 grid gap-2">
          {REQUIRED_CANDIDATE_FIELD_OPTIONS.map((field) => (
            <label
              key={field}
              className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm text-black"
            >
              <Checkbox
                checked={form.requiredCandidateFields.includes(field)}
                onCheckedChange={(checked) =>
                  update({
                    requiredCandidateFields: toggleValue(
                      form.requiredCandidateFields,
                      field,
                      checked === true
                    ),
                  })
                }
              />
              {fieldLabel(field)}
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-black">
          Optional candidate fields
        </h3>
        <div className="mt-3 grid gap-2">
          {OPTIONAL_CANDIDATE_FIELD_OPTIONS.map((field) => (
            <label
              key={field}
              className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm text-black"
            >
              <Checkbox
                checked={form.optionalCandidateFields.includes(field)}
                onCheckedChange={(checked) =>
                  update({
                    optionalCandidateFields: toggleValue(
                      form.optionalCandidateFields,
                      field,
                      checked === true
                    ),
                  })
                }
              />
              {fieldLabel(field)}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
