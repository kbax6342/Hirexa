CREATE TABLE "RecruiterProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "jobTitle" TEXT,
  "workEmail" TEXT,
  "phone" TEXT,
  "linkedinUrl" TEXT,
  "agencyName" TEXT,
  "agencyWebsite" TEXT,
  "city" TEXT,
  "state" TEXT,
  "companyDescription" TEXT,
  "hiringIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "recruitingSpecialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "hiringRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "seniorityLevels" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "employmentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "workModes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "hiringLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "calendarUrl" TEXT,
  "intakeEmail" TEXT,
  "resumeSubmissionEmail" TEXT,
  "outreachTone" TEXT DEFAULT 'professional',
  "autoFollowUp" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecruiterProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecruiterProfile_userId_key" ON "RecruiterProfile"("userId");
CREATE INDEX "RecruiterProfile_agencyName_idx" ON "RecruiterProfile"("agencyName");
CREATE INDEX "RecruiterProfile_workEmail_idx" ON "RecruiterProfile"("workEmail");

ALTER TABLE "RecruiterProfile"
ADD CONSTRAINT "RecruiterProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
