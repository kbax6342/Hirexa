import QuestionsClient from "@/app/questions/questionsClient";

export default function QuestionsClientsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 pb-10 pt-[110]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Key questions</h1>
            <p className="mt-1 text-sm text-slate-600">
              These answers help us auto-fill your job applications accurately.
            </p>
          </div>

          <QuestionsClient />
        </div>
      </div>
    </div>
  );
}
