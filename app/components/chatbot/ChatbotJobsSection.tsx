"use client";

import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import type { ChatbotJobInput, CompanyChatbotInput } from "@/lib/chatbot/types";
import { EMPTY_CHATBOT_JOB } from "@/lib/chatbot/types";

type ChatbotJobsSectionProps = {
  form: CompanyChatbotInput;
  update: (patch: Partial<CompanyChatbotInput>) => void;
};

export default function ChatbotJobsSection({
  form,
  update,
}: ChatbotJobsSectionProps) {
  function updateJob(index: number, patch: Partial<ChatbotJobInput>) {
    update({
      jobs: form.jobs.map((job, jobIndex) =>
        jobIndex === index ? { ...job, ...patch } : job
      ),
    });
  }

  function removeJob(index: number) {
    update({ jobs: form.jobs.filter((_, jobIndex) => jobIndex !== index) });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Jobs</h3>
          <p className="text-sm text-slate-500">
            Add the roles the chatbot should recommend and screen against.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            update({
              jobs: [...form.jobs, { ...EMPTY_CHATBOT_JOB }],
            })
          }
          className="shrink-0"
        >
          <PlusIcon className="h-4 w-4" />
          Add job
        </Button>
      </div>

      {form.jobs.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-500">
          No jobs yet.
        </div>
      ) : null}

      <div className="space-y-4">
        {form.jobs.map((job, index) => (
          <div
            key={job.id ?? index}
            className="rounded-md border border-slate-200 p-4"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-950">
                Job {index + 1}
              </h4>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => removeJob(index)}
                aria-label={`Remove job ${index + 1}`}
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Title</Label>
                <Input
                  value={job.title}
                  onChange={(event) => updateJob(index, { title: event.target.value })}
                  placeholder="Warehouse Associate"
                />
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  value={job.location ?? ""}
                  onChange={(event) => updateJob(index, { location: event.target.value })}
                  placeholder="Dearborn, MI"
                />
              </div>
              <div>
                <Label>Pay range</Label>
                <Input
                  value={job.payRange ?? ""}
                  onChange={(event) => updateJob(index, { payRange: event.target.value })}
                  placeholder="$18-$22/hr"
                />
              </div>
              <div>
                <Label>Shift</Label>
                <Input
                  value={job.shift ?? ""}
                  onChange={(event) => updateJob(index, { shift: event.target.value })}
                  placeholder="1st Shift"
                />
              </div>
              <div>
                <Label>Employment type</Label>
                <Input
                  value={job.employmentType ?? ""}
                  onChange={(event) =>
                    updateJob(index, { employmentType: event.target.value })
                  }
                  placeholder="Temp-to-Hire"
                />
              </div>
              <div>
                <Label>Status</Label>
                <Input
                  value={job.status ?? ""}
                  onChange={(event) => updateJob(index, { status: event.target.value })}
                  placeholder="OPEN"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Requirements</Label>
                <Textarea
                  value={job.requirements ?? ""}
                  onChange={(event) =>
                    updateJob(index, { requirements: event.target.value })
                  }
                  placeholder="Reliable transportation, able to lift 40 lbs"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Application URL</Label>
                <Input
                  value={job.applicationUrl ?? ""}
                  onChange={(event) =>
                    updateJob(index, { applicationUrl: event.target.value })
                  }
                  placeholder="https://example.com/apply"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={job.description ?? ""}
                  onChange={(event) =>
                    updateJob(index, { description: event.target.value })
                  }
                  placeholder="Describe the role, schedule, and work environment."
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
