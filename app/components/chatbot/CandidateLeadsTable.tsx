import { Card, CardContent } from "@/app/components/ui/card";

const EMPTY_VALUE = "\u2014";

type JsonRecord = Record<string, unknown>;

export type CandidateLeadsTableLead = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  desiredJobType: string | null;
  employmentType: string | null;
  preferredShift: string | null;
  availability: unknown;
  workExperienceSummary: string | null;
  transportationStatus: string | null;
  workAuthorization: string | null;
  resumeUrl: string | null;
  linkedinUrl: string | null;
  certifications: string[];
  desiredPay: string | null;
  startDate: string | null;
  previousEmployer: string | null;
  educationLevel: string | null;
  languagesSpoken: string[];
  veteranStatus: string | null;
  referralSource: string | null;
  qualificationStatus: string | null;
  candidateScore: number | null;
  aiSummary: string | null;
  structuredAnswersJson: unknown;
  createdAt: Date | string;
};

type CandidateLeadsTableProps = {
  leads: CandidateLeadsTableLead[];
  totalLeads: number;
};

type LeadColumn = {
  header: string;
  getValue: (lead: CandidateLeadsTableLead) => string;
  isLong?: boolean;
  isLink?: boolean;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeLookupKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getRecordValue(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (key in record) return record[key];
  }

  const normalizedEntries = Object.entries(record).map(([key, value]) => [
    normalizeLookupKey(key),
    value,
  ] as const);

  for (const key of keys) {
    const normalizedKey = normalizeLookupKey(key);
    const match = normalizedEntries.find(([entryKey]) => entryKey === normalizedKey);
    if (match) return match[1];
  }

  return undefined;
}

function getStructuredValue(lead: CandidateLeadsTableLead, keys: string[]) {
  if (!isRecord(lead.structuredAnswersJson)) return undefined;
  return getRecordValue(lead.structuredAnswersJson, keys);
}

function toDisplayString(value: unknown): string {
  if (value == null) return EMPTY_VALUE;

  if (value instanceof Date) {
    return formatCreatedDate(value);
  }

  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => toDisplayString(entry))
      .filter((entry) => entry !== EMPTY_VALUE);

    return entries.length > 0 ? entries.join(", ") : EMPTY_VALUE;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized || EMPTY_VALUE;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, entryValue]) => {
        const displayValue = toDisplayString(entryValue);
        return displayValue === EMPTY_VALUE ? null : `${key}: ${displayValue}`;
      })
      .filter(Boolean);

    return entries.length > 0 ? entries.join("; ") : EMPTY_VALUE;
  }

  return EMPTY_VALUE;
}

function hasDisplayValue(value: unknown) {
  return toDisplayString(value) !== EMPTY_VALUE;
}

function firstPresent(...values: unknown[]) {
  return values.find(hasDisplayValue);
}

function splitStructuredName(lead: CandidateLeadsTableLead) {
  const fullName = toDisplayString(
    firstPresent(
      getStructuredValue(lead, ["fullName", "candidateName", "name"]),
      [lead.firstName, lead.lastName].filter(Boolean).join(" ")
    )
  );

  if (fullName === EMPTY_VALUE) {
    return { firstName: EMPTY_VALUE, lastName: EMPTY_VALUE };
  }

  const parts = fullName.split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? EMPTY_VALUE,
    lastName: parts.slice(1).join(" ") || EMPTY_VALUE,
  };
}

function getFirstName(lead: CandidateLeadsTableLead) {
  const structuredName = splitStructuredName(lead);
  return toDisplayString(
    firstPresent(
      lead.firstName,
      getStructuredValue(lead, ["firstName", "candidateFirstName"]),
      structuredName.firstName
    )
  );
}

function getLastName(lead: CandidateLeadsTableLead) {
  const structuredName = splitStructuredName(lead);
  return toDisplayString(
    firstPresent(
      lead.lastName,
      getStructuredValue(lead, ["lastName", "candidateLastName"]),
      structuredName.lastName
    )
  );
}

function getAvailability(lead: CandidateLeadsTableLead) {
  const availability = firstPresent(
    lead.availability,
    getStructuredValue(lead, ["availability"])
  );

  if (isRecord(availability)) {
    const shiftAvailability = firstPresent(
      getRecordValue(availability, ["shiftAvailability", "shifts"]),
      lead.preferredShift,
      getStructuredValue(lead, ["shiftAvailability"])
    );
    const startAvailability = firstPresent(
      getRecordValue(availability, ["startAvailability", "startDate"]),
      lead.startDate,
      getStructuredValue(lead, ["startAvailability", "startDate"])
    );
    const parts = [
      hasDisplayValue(shiftAvailability)
        ? `Shifts: ${toDisplayString(shiftAvailability)}`
        : null,
      hasDisplayValue(startAvailability)
        ? `Start: ${toDisplayString(startAvailability)}`
        : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join("; ") : EMPTY_VALUE;
  }

  return toDisplayString(
    firstPresent(
      availability,
      getStructuredValue(lead, ["shiftAvailability"]),
      getStructuredValue(lead, ["startAvailability"])
    )
  );
}

function getWorkExperience(lead: CandidateLeadsTableLead) {
  return toDisplayString(
    firstPresent(
      lead.workExperienceSummary,
      getStructuredValue(lead, [
        "workExperienceSummary",
        "workExperience",
        "experience",
      ])
    )
  );
}

function getResumeOrWorkHistory(lead: CandidateLeadsTableLead) {
  return toDisplayString(
    firstPresent(
      lead.resumeUrl,
      getStructuredValue(lead, [
        "resumeUploadOrWorkHistorySummary",
        "resumeOrWorkHistorySummary",
        "workHistorySummary",
        "resumeUrl",
      ]),
      lead.workExperienceSummary
    )
  );
}

function getDesiredPay(lead: CandidateLeadsTableLead) {
  return toDisplayString(
    firstPresent(
      lead.desiredPay,
      getStructuredValue(lead, ["desiredPay", "desiredPayRange", "payPreference"])
    )
  );
}

function getCreatedDate(lead: CandidateLeadsTableLead) {
  return formatCreatedDate(lead.createdAt);
}

function formatCreatedDate(value: Date | string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return EMPTY_VALUE;
  }

  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function formatScore(lead: CandidateLeadsTableLead) {
  return toDisplayString(
    firstPresent(lead.candidateScore, getStructuredValue(lead, ["score"]))
  );
}

function formatLeadQuality(lead: CandidateLeadsTableLead) {
  return toDisplayString(
    firstPresent(
      lead.qualificationStatus,
      getStructuredValue(lead, ["leadQuality", "qualificationStatus", "tier"])
    )
  );
}

function getExternalHref(value: string) {
  if (value === EMPTY_VALUE) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(value)) return `https://${value}`;

  return null;
}

const columns: LeadColumn[] = [
  { header: "First Name", getValue: getFirstName },
  { header: "Last Name", getValue: getLastName },
  {
    header: "Email",
    getValue: (lead) =>
      toDisplayString(firstPresent(lead.email, getStructuredValue(lead, ["email"]))),
    isLong: true,
  },
  {
    header: "Phone",
    getValue: (lead) =>
      toDisplayString(firstPresent(lead.phone, getStructuredValue(lead, ["phone"]))),
  },
  {
    header: "City",
    getValue: (lead) =>
      toDisplayString(firstPresent(lead.city, getStructuredValue(lead, ["city"]))),
  },
  {
    header: "State",
    getValue: (lead) =>
      toDisplayString(firstPresent(lead.state, getStructuredValue(lead, ["state"]))),
  },
  {
    header: "Zip Code",
    getValue: (lead) =>
      toDisplayString(
        firstPresent(lead.zipCode, getStructuredValue(lead, ["zipCode", "zip"]))
      ),
  },
  {
    header: "Desired Job Type",
    getValue: (lead) =>
      toDisplayString(
        firstPresent(
          lead.desiredJobType,
          lead.employmentType,
          getStructuredValue(lead, ["desiredJobType", "employmentType", "jobType"])
        )
      ),
  },
  { header: "Availability", getValue: getAvailability, isLong: true },
  { header: "Work Experience", getValue: getWorkExperience, isLong: true },
  {
    header: "Preferred Shift",
    getValue: (lead) =>
      toDisplayString(
        firstPresent(
          lead.preferredShift,
          getStructuredValue(lead, ["preferredShift", "shiftAvailability"])
        )
      ),
  },
  {
    header: "Transportation Status",
    getValue: (lead) =>
      toDisplayString(
        firstPresent(
          lead.transportationStatus,
          getStructuredValue(lead, ["transportationStatus", "transportation"])
        )
      ),
  },
  {
    header: "Work Authorization Status",
    getValue: (lead) =>
      toDisplayString(
        firstPresent(
          lead.workAuthorization,
          getStructuredValue(lead, [
            "workAuthorizationStatus",
            "workAuthorization",
          ])
        )
      ),
  },
  {
    header: "Resume / Work History Summary",
    getValue: getResumeOrWorkHistory,
    isLong: true,
    isLink: true,
  },
  {
    header: "LinkedIn URL",
    getValue: (lead) =>
      toDisplayString(
        firstPresent(lead.linkedinUrl, getStructuredValue(lead, ["linkedinUrl"]))
      ),
    isLong: true,
    isLink: true,
  },
  {
    header: "Certifications",
    getValue: (lead) =>
      toDisplayString(
        firstPresent(
          lead.certifications,
          getStructuredValue(lead, ["certifications", "certification"])
        )
      ),
    isLong: true,
  },
  { header: "Desired Pay", getValue: getDesiredPay },
  {
    header: "Start Date",
    getValue: (lead) =>
      toDisplayString(
        firstPresent(
          lead.startDate,
          getStructuredValue(lead, ["startDate", "startAvailability"])
        )
      ),
  },
  {
    header: "Previous Employer",
    getValue: (lead) =>
      toDisplayString(
        firstPresent(
          lead.previousEmployer,
          getStructuredValue(lead, ["previousEmployer", "lastEmployer"])
        )
      ),
    isLong: true,
  },
  {
    header: "Education Level",
    getValue: (lead) =>
      toDisplayString(
        firstPresent(
          lead.educationLevel,
          getStructuredValue(lead, ["educationLevel", "education"])
        )
      ),
    isLong: true,
  },
  {
    header: "Languages Spoken",
    getValue: (lead) =>
      toDisplayString(
        firstPresent(
          lead.languagesSpoken,
          getStructuredValue(lead, ["languagesSpoken", "languages"])
        )
      ),
    isLong: true,
  },
  {
    header: "Veteran Status",
    getValue: (lead) =>
      toDisplayString(
        firstPresent(
          lead.veteranStatus,
          getStructuredValue(lead, ["veteranStatus"])
        )
      ),
  },
  {
    header: "Referral Source",
    getValue: (lead) =>
      toDisplayString(
        firstPresent(
          lead.referralSource,
          getStructuredValue(lead, ["referralSource"])
        )
      ),
    isLong: true,
  },
  { header: "Score", getValue: formatScore },
  { header: "Lead Quality", getValue: formatLeadQuality },
  { header: "Created", getValue: getCreatedDate },
];

function CandidateLeadCell({
  value,
  isLong,
  isLink,
}: {
  value: string;
  isLong?: boolean;
  isLink?: boolean;
}) {
  const title = value === EMPTY_VALUE ? undefined : value;
  const href = isLink ? getExternalHref(value) : null;
  const content = href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-sky-700 underline-offset-2 hover:underline"
    >
      {value}
    </a>
  ) : (
    value
  );

  return (
    <td className="bg-white px-4 py-3 align-top text-slate-700">
      <div
        title={title}
        className={
          isLong
            ? "max-w-[22rem] truncate"
            : "max-w-[12rem] truncate whitespace-nowrap"
        }
      >
        {content}
      </div>
    </td>
  );
}

export default function CandidateLeadsTable({
  leads,
  totalLeads,
}: CandidateLeadsTableProps) {
  return (
    <Card className="border-slate-200 bg-white text-black shadow-sm">
      <CardContent className="bg-white p-5 text-black sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-black">
              Candidate Leads
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {totalLeads} {totalLeads === 1 ? "lead has" : "leads have"} been captured for this company chatbot.
            </p>
          </div>
          <div className="w-full rounded-md border border-slate-200 bg-slate-50 px-4 py-3 sm:w-auto sm:min-w-36">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Captured leads
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-950">
              {totalLeads}
            </div>
          </div>
        </div>

        {leads.length > 0 ? (
          <div className="mt-5 overflow-x-auto rounded-md border border-slate-200 bg-white text-black">
            <table className="min-w-max bg-white text-left text-sm text-black">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {columns.map((column) => (
                    <th key={column.header} className="whitespace-nowrap px-4 py-3">
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-black">
                {leads.map((lead) => (
                  <tr key={lead.id} className="bg-white text-black">
                    {columns.map((column) => (
                      <CandidateLeadCell
                        key={column.header}
                        value={column.getValue(lead)}
                        isLong={column.isLong}
                        isLink={column.isLink}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 rounded-md border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            No candidate leads have been saved yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
