"use client";

import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import type { CompanyChatbotInput } from "@/lib/chatbot/types";

type ChatbotBrandingSectionProps = {
  form: CompanyChatbotInput;
  fieldErrors?: Record<string, string>;
  update: (patch: Partial<CompanyChatbotInput>) => void;
};

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null;
}

export default function ChatbotBrandingSection({
  form,
  fieldErrors,
  update,
}: ChatbotBrandingSectionProps) {
  return (
    <div className="grid gap-5">
      <div>
        <Label htmlFor="logoUrl">Logo URL</Label>
        <Input
          id="logoUrl"
          value={form.logoUrl ?? ""}
          onChange={(event) => update({ logoUrl: event.target.value })}
          placeholder="/branding/staffing-chat-avatar.png"
        />
      </div>
      <div>
        <Label htmlFor="brandColor">Brand color</Label>
        <div className="flex gap-3">
          <Input
            id="brandColor"
            value={form.brandColor ?? ""}
            onChange={(event) => update({ brandColor: event.target.value })}
            placeholder="#0284c7"
          />
          <input
            aria-label="Brand color swatch"
            type="color"
            value={form.brandColor || "#0284c7"}
            onChange={(event) => update({ brandColor: event.target.value })}
            className="h-10 w-12 rounded-md border border-slate-200 bg-white p-1"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="chatTitle">Chat title</Label>
        <Input
          id="chatTitle"
          value={form.chatTitle ?? ""}
          onChange={(event) => update({ chatTitle: event.target.value })}
          placeholder="Hirexa AI"
        />
        <FieldError message={fieldErrors?.chatTitle} />
      </div>
      <div>
        <Label htmlFor="chatSubtitle">Chat subtitle</Label>
        <Input
          id="chatSubtitle"
          value={form.chatSubtitle ?? ""}
          onChange={(event) => update({ chatSubtitle: event.target.value })}
          placeholder="Candidate screening assistant"
        />
      </div>
      <div>
        <Label htmlFor="welcomeMessage">Welcome message</Label>
        <Textarea
          id="welcomeMessage"
          value={form.welcomeMessage ?? ""}
          onChange={(event) => update({ welcomeMessage: event.target.value })}
          placeholder="Hi, I’m Hirexa AI. I can help screen you for open roles."
        />
        <FieldError message={fieldErrors?.welcomeMessage} />
      </div>
      <div>
        <Label htmlFor="fallbackMessage">Fallback message</Label>
        <Textarea
          id="fallbackMessage"
          value={form.fallbackMessage ?? ""}
          onChange={(event) => update({ fallbackMessage: event.target.value })}
          placeholder="Thanks. I’m still collecting a few job-relevant details."
        />
      </div>
    </div>
  );
}
