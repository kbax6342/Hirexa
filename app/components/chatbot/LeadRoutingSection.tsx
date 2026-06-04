"use client";

import { Checkbox } from "@/app/components/ui/checkbox";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import type { CompanyChatbotInput } from "@/lib/chatbot/types";

type LeadRoutingSectionProps = {
  form: CompanyChatbotInput;
  update: (patch: Partial<CompanyChatbotInput>) => void;
};

export default function LeadRoutingSection({
  form,
  update,
}: LeadRoutingSectionProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <Label htmlFor="leadRecruiterEmail">Recruiter email</Label>
        <Input
          id="leadRecruiterEmail"
          type="email"
          value={form.recruiterEmail ?? ""}
          onChange={(event) => update({ recruiterEmail: event.target.value })}
          placeholder="recruiting@example.com"
        />
      </div>
      <div>
        <Label htmlFor="webhookUrl">Webhook URL</Label>
        <Input
          id="webhookUrl"
          value={form.webhookUrl ?? ""}
          onChange={(event) => update({ webhookUrl: event.target.value })}
          placeholder="https://example.com/webhooks/hirexa"
        />
      </div>
      <div>
        <Label htmlFor="redirectUrl">Redirect URL</Label>
        <Input
          id="redirectUrl"
          value={form.redirectUrl ?? ""}
          onChange={(event) => update({ redirectUrl: event.target.value })}
          placeholder="https://example.com/thanks"
        />
      </div>
      <div className="grid gap-3">
        <label className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm">
          <Checkbox
            checked={form.saveLeadToDashboard}
            onCheckedChange={(checked) =>
              update({ saveLeadToDashboard: checked === true })
            }
          />
          Save lead to dashboard
        </label>
        <label className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm">
          <Checkbox
            checked={form.sendEmailNotification}
            onCheckedChange={(checked) =>
              update({ sendEmailNotification: checked === true })
            }
          />
          Send email notification
        </label>
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="completionMessage">Completion message</Label>
        <Textarea
          id="completionMessage"
          value={form.completionMessage ?? ""}
          onChange={(event) => update({ completionMessage: event.target.value })}
          placeholder="Thanks — a recruiter can review this information and follow up."
        />
      </div>
    </div>
  );
}
