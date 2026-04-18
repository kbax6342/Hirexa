import { CheckCircleIcon } from "@heroicons/react/24/solid";

export default function BestFitReasonsCard({
  reasons,
}: {
  reasons: string[];
}) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
        <CheckCircleIcon className="h-5 w-5" />
        Best-fit reasons
      </div>
      <ul className="mt-3 space-y-2 text-sm text-emerald-900">
        {reasons.length ? (
          reasons.map((reason) => <li key={reason}>• {reason}</li>)
        ) : (
          <li>• Match detail will show here after scoring runs.</li>
        )}
      </ul>
    </div>
  );
}
