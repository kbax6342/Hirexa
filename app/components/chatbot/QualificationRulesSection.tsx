"use client";

import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import type { CompanyChatbotInput } from "@/lib/chatbot/types";

type QualificationRulesSectionProps = {
  form: CompanyChatbotInput;
  update: (patch: Partial<CompanyChatbotInput>) => void;
};

function splitList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function QualificationRulesSection({
  form,
  update,
}: QualificationRulesSectionProps) {
  return (
    <div className="grid gap-5">
      <div>
        <Label htmlFor="requiredTransportation">Required transportation</Label>
        <Input
          id="requiredTransportation"
          value={form.requiredTransportation ?? ""}
          onChange={(event) =>
            update({ requiredTransportation: event.target.value })
          }
          placeholder="Reliable transportation required"
        />
      </div>
      <div>
        <Label htmlFor="requiredWorkAuthorization">Required work authorization</Label>
        <Input
          id="requiredWorkAuthorization"
          value={form.requiredWorkAuthorization ?? ""}
          onChange={(event) =>
            update({ requiredWorkAuthorization: event.target.value })
          }
          placeholder="Authorized to work in the United States"
        />
      </div>
      <div>
        <Label htmlFor="minimumYearsExperience">Minimum years experience</Label>
        <Input
          id="minimumYearsExperience"
          type="number"
          value={form.minimumYearsExperience ?? ""}
          onChange={(event) =>
            update({
              minimumYearsExperience: event.target.value
                ? Number(event.target.value)
                : null,
            })
          }
        />
      </div>
      <div>
        <Label htmlFor="candidateScoreThreshold">Candidate score threshold</Label>
        <Input
          id="candidateScoreThreshold"
          type="number"
          value={form.candidateScoreThreshold ?? ""}
          onChange={(event) =>
            update({
              candidateScoreThreshold: event.target.value
                ? Number(event.target.value)
                : null,
            })
          }
        />
      </div>
      <div>
        <Label htmlFor="requiredShiftAvailability">Required shift availability</Label>
        <Textarea
          id="requiredShiftAvailability"
          value={form.requiredShiftAvailability.join("\n")}
          onChange={(event) =>
            update({ requiredShiftAvailability: splitList(event.target.value) })
          }
          placeholder={"1st Shift\n2nd Shift"}
        />
      </div>
      <div>
        <Label htmlFor="requiredCertifications">Required certifications</Label>
        <Textarea
          id="requiredCertifications"
          value={form.requiredCertifications.join("\n")}
          onChange={(event) =>
            update({ requiredCertifications: splitList(event.target.value) })
          }
          placeholder={"Forklift certification\nOSHA 10"}
        />
      </div>
      <div>
        <Label htmlFor="disqualifyingAnswers">Disqualifying answers</Label>
        <Textarea
          id="disqualifyingAnswers"
          value={form.disqualifyingAnswers.join("\n")}
          onChange={(event) =>
            update({ disqualifyingAnswers: splitList(event.target.value) })
          }
          placeholder={"Cannot work any configured shift\nRequires sponsorship when client cannot sponsor"}
        />
      </div>
    </div>
  );
}
