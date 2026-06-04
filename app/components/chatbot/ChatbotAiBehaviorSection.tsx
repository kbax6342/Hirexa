"use client";

import { Checkbox } from "@/app/components/ui/checkbox";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import type { CompanyChatbotInput } from "@/lib/chatbot/types";

type ChatbotAiBehaviorSectionProps = {
  form: CompanyChatbotInput;
  update: (patch: Partial<CompanyChatbotInput>) => void;
};

const tones = ["friendly", "professional", "high-energy", "formal", "casual"];
const answerLengths = ["concise", "standard", "detailed"];

export default function ChatbotAiBehaviorSection({
  form,
  update,
}: ChatbotAiBehaviorSectionProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <Label htmlFor="tone">Tone</Label>
        <select
          id="tone"
          value={form.tone}
          onChange={(event) => update({ tone: event.target.value })}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {tones.map((tone) => (
            <option key={tone} value={tone}>
              {tone}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="greetingStyle">Greeting style</Label>
        <Input
          id="greetingStyle"
          value={form.greetingStyle ?? ""}
          onChange={(event) => update({ greetingStyle: event.target.value })}
          placeholder="Warm, direct, branch recruiter"
        />
      </div>
      <div>
        <Label htmlFor="answerLength">Answer length</Label>
        <select
          id="answerLength"
          value={form.answerLength}
          onChange={(event) => update({ answerLength: event.target.value })}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {answerLengths.map((length) => (
            <option key={length} value={length}>
              {length}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="fallbackBehavior">Fallback behavior</Label>
        <Input
          id="fallbackBehavior"
          value={form.fallbackBehavior ?? ""}
          onChange={(event) => update({ fallbackBehavior: event.target.value })}
          placeholder="ask_one_follow_up"
        />
      </div>
      <label className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm">
        <Checkbox
          checked={form.showAiDisclosure}
          onCheckedChange={(checked) => update({ showAiDisclosure: checked === true })}
        />
        Show AI disclosure
      </label>
      <label className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm">
        <Checkbox
          checked={form.useEmojis}
          onCheckedChange={(checked) => update({ useEmojis: checked === true })}
        />
        Use emojis
      </label>
    </div>
  );
}
