import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

type MissingField = {
  key: string;
  label: string;
  hint: string;
};

const PROFILE_COMPLETION_FIELDS: MissingField[] = [
  { key: "firstName", label: "First name", hint: "Used for legal name sections." },
  { key: "lastName", label: "Last name", hint: "Used for legal name sections." },
  { key: "phone", label: "Phone number", hint: "Many applications require a contact number." },
  { key: "address", label: "Street address", hint: "Needed for employer records." },
  { key: "city", label: "City", hint: "Used on location-based forms." },
  { key: "state", label: "State", hint: "Used on location-based forms." },
  { key: "postalCode", label: "Postal code", hint: "Used on location-based forms." },
  { key: "linkedinUrl", label: "LinkedIn URL", hint: "Frequently requested for professional profile review." },
  { key: "authorizedUS", label: "Work authorization", hint: "Answer if you are authorized to work in the U.S." },
  { key: "sponsorship", label: "Sponsorship requirement", hint: "Whether you need visa sponsorship now or later." },
  { key: "startDate", label: "Available start date", hint: "Helps employers understand your timeline." },
  { key: "relocate", label: "Open to relocation", hint: "Some applications ask your relocation preference." },
];

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export default async function ApplicationAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  const profile = await prisma.userProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      linkedinUrl: true,
      authorizedUS: true,
      sponsorship: true,
      startDate: true,
      relocate: true,
  
      resume: { select: { id: true } }, // Resumes table
      resumeFiles: { select: { id: true }, take: 1 }, // ResumeFiles table
    },
  });

  if (!profile) {
    redirect("/onboarding/start");
  }

  const application = await prisma.jobApplication.findFirst({
    where: {
      id,
      userProfileId: profile.id,
    },
    select: {
      id: true,
      jobTitle: true,
      company: true,
      location: true,
      status: true,
      updatedAt: true,
    },
  });

  if (!application) {
    notFound();
  }

  const missingFields = PROFILE_COMPLETION_FIELDS.filter((field) => {
    const value = profile[field.key as keyof typeof profile];
    return !hasValue(value);
  });

  const isResumeMissing = !profile.resume && profile.resumeFiles.length === 0;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Application audit</p>
      <h1 className="mt-2 text-3xl font-semibold text-gray-900">
        {application.jobTitle} at {application.company}
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        Auto-apply completed. Review the remaining fields below before submitting this application.
      </p>

      <div className="mt-6 grid gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Current status</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{application.status}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Location</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{application.location || "Not specified"}</p>
        </div>
      </div>

      <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-lg font-semibold text-amber-900">Fields still needed from you</h2>

        {missingFields.length === 0 && !isResumeMissing ? (
          <p className="mt-3 text-sm text-amber-900">
            Great news — your profile has all core fields needed for auto-apply.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {missingFields.map((field) => (
              <li key={field.key} className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-sm font-semibold text-gray-900">{field.label}</p>
                <p className="mt-1 text-xs text-gray-600">{field.hint}</p>
              </li>
            ))}
            {isResumeMissing ? (
              <li className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-sm font-semibold text-gray-900">Resume</p>
                <p className="mt-1 text-xs text-gray-600">
                  Upload your resume so job sites can populate experience and education.
                </p>
              </li>
            ) : null}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/settings"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Complete profile
          </Link>
          <Link
            href="/applications"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            View all applications
          </Link>
        </div>
      </section>
    </main>
  );
}
