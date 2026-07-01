"use client";

import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import type { CompanyChatbotInput } from "@/lib/chatbot/types";

type CompanyProfileSectionProps = {
  form: CompanyChatbotInput;
  fieldErrors?: Record<string, string>;
  update: (patch: Partial<CompanyChatbotInput>) => void;
};

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null;
}

export default function CompanyProfileSection({
  form,
  fieldErrors,
  update,
}: CompanyProfileSectionProps) {
  return (
    <div className="grid gap-5">
      <div>
        <Label htmlFor="companyName">Company name</Label>
        <Input
          id="companyName"
          value={form.companyName}
          onChange={(event) => update({ companyName: event.target.value })}
          placeholder="Acme Staffing"
        />
        <FieldError message={fieldErrors?.companyName} />
      </div>
      <div>
        <Label htmlFor="companySlug">Company slug</Label>
        <Input
          id="companySlug"
          value={form.companySlug}
          onChange={(event) => update({ companySlug: event.target.value })}
          placeholder="acme-staffing"
        />
        <FieldError message={fieldErrors?.companySlug} />
      </div>
      <div>
        <Label htmlFor="websiteUrl">Website URL</Label>
        <Input
          id="websiteUrl"
          value={form.websiteUrl ?? ""}
          onChange={(event) => update({ websiteUrl: event.target.value })}
          placeholder="https://example.com"
        />
      </div>
      <div>
        <Label htmlFor="industry">Industry</Label>
        <Input
          id="industry"
          value={form.industry ?? ""}
          onChange={(event) => update({ industry: event.target.value })}
          placeholder="Staffing and Recruiting"
        />
      </div>
      <div>
        <Label htmlFor="mainContactEmail">Main contact email</Label>
        <Input
          id="mainContactEmail"
          type="email"
          value={form.mainContactEmail ?? ""}
          onChange={(event) => update({ mainContactEmail: event.target.value })}
          placeholder="ops@example.com"
        />
      </div>
      <div>
        <Label htmlFor="recruiterEmail">Recruiter email</Label>
        <Input
          id="recruiterEmail"
          type="email"
          value={form.recruiterEmail ?? ""}
          onChange={(event) => update({ recruiterEmail: event.target.value })}
          placeholder="recruiting@example.com"
        />
      </div>
      <div>
        <Label htmlFor="companyPhone">Company phone</Label>
        <Input
          id="companyPhone"
          value={form.companyPhone ?? ""}
          onChange={(event) => update({ companyPhone: event.target.value })}
          placeholder="(313) 555-0100"
        />
      </div>
      <div>
        <Label htmlFor="locationsServed">Locations served</Label>
        <Textarea
          id="locationsServed"
          value={form.locationsServed.join("\n")}
          onChange={(event) =>
            update({
              locationsServed: event.target.value
                .split(/\n|,/)
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
          placeholder={"Dearborn\nDetroit\nLivonia"}
        />
      </div>
      <div>
        <Label htmlFor="companyDescription">Company description</Label>
        <Textarea
          id="companyDescription"
          value={form.companyDescription ?? ""}
          onChange={(event) => update({ companyDescription: event.target.value })}
          placeholder="Describe the hiring company and the type of candidates this chatbot should screen."
          className="bg-white text-black placeholder:text-slate-500"
        />
      </div>
    </div>
  );
}
