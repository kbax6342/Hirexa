"use client";

import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import type {
  ChatbotQuestionInput,
  CompanyChatbotInput,
} from "@/lib/chatbot/types";
import { EMPTY_CHATBOT_QUESTION } from "@/lib/chatbot/types";

type ScreeningQuestionsSectionProps = {
  form: CompanyChatbotInput;
  update: (patch: Partial<CompanyChatbotInput>) => void;
};

export default function ScreeningQuestionsSection({
  form,
  update,
}: ScreeningQuestionsSectionProps) {
  function updateQuestion(index: number, patch: Partial<ChatbotQuestionInput>) {
    update({
      questions: form.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...patch } : question
      ),
    });
  }

  function removeQuestion(index: number) {
    update({
      questions: form.questions.filter((_, questionIndex) => questionIndex !== index),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">
            Screening questions
          </h3>
          <p className="text-sm text-slate-500">
            Reusable questions are included in the demo prompt and candidate answer model.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            update({
              questions: [
                ...form.questions,
                {
                  ...EMPTY_CHATBOT_QUESTION,
                  order: form.questions.length + 1,
                },
              ],
            })
          }
          className="bg-sky-600 text-white hover:bg-sky-700 hover:text-white"
        >
          <PlusIcon className="h-4 w-4" />
          Add question
        </Button>
      </div>

      {form.questions.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-500">
          No screening questions yet.
        </div>
      ) : null}

      <div className="space-y-4">
        {form.questions.map((question, index) => (
          <div
            key={question.id ?? index}
            className="rounded-md border border-slate-200 p-4"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-950">
                Question {index + 1}
              </h4>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => removeQuestion(index)}
                aria-label={`Remove question ${index + 1}`}
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4">
              <div>
                <Label>Question text</Label>
                <Textarea
                  value={question.questionText}
                  onChange={(event) =>
                    updateQuestion(index, { questionText: event.target.value })
                  }
                  placeholder="Do you have reliable transportation to this location?"
                />
              </div>
              <div>
                <Label>Question type</Label>
                <Input
                  value={question.questionType}
                  onChange={(event) =>
                    updateQuestion(index, { questionType: event.target.value })
                  }
                  placeholder="text, single_select, multi_select"
                />
              </div>
              <div>
                <Label>Order</Label>
                <Input
                  type="number"
                  value={question.order}
                  onChange={(event) =>
                    updateQuestion(index, { order: Number(event.target.value) })
                  }
                />
              </div>
              <label className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm">
                <Checkbox
                  checked={question.isRequired}
                  onCheckedChange={(checked) =>
                    updateQuestion(index, { isRequired: checked === true })
                  }
                />
                Required
              </label>
              <label className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm">
                <Checkbox
                  checked={question.isKnockout}
                  onCheckedChange={(checked) =>
                    updateQuestion(index, { isKnockout: checked === true })
                  }
                />
                Knockout
              </label>
              <div>
                <Label>Options</Label>
                <Textarea
                  value={question.options.join("\n")}
                  onChange={(event) =>
                    updateQuestion(index, {
                      options: event.target.value
                        .split(/\n|,/)
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={"Yes\nNo\nDepends on location"}
                />
              </div>
              <div>
                <Label>Expected answer</Label>
                <Input
                  value={question.expectedAnswer ?? ""}
                  onChange={(event) =>
                    updateQuestion(index, { expectedAnswer: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Conditional logic</Label>
                <Input
                  value={question.conditionalLogic ?? ""}
                  onChange={(event) =>
                    updateQuestion(index, { conditionalLogic: event.target.value })
                  }
                  placeholder="Ask if desiredJobType = Warehouse"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
