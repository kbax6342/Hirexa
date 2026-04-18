import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";

export default function RedFlagsCard({
  redFlags,
  missingQualifications,
}: {
  redFlags: string[];
  missingQualifications: string[];
}) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-rose-800">
        <ExclamationTriangleIcon className="h-5 w-5" />
        Red flags and gaps
      </div>
      <ul className="mt-3 space-y-2 text-sm text-rose-900">
        {redFlags.length ? redFlags.map((flag) => <li key={flag}>• {flag}</li>) : null}
        {missingQualifications.length ? (
          <li>
            • Missing qualifications: {missingQualifications.join(", ")}
          </li>
        ) : null}
        {!redFlags.length && !missingQualifications.length ? (
          <li>• No major flags surfaced for this candidate yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
