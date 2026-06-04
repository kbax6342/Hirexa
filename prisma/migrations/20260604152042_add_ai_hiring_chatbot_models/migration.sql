-- CreateTable
CREATE TABLE "CompanyChatbot" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "industry" TEXT,
    "companyDescription" TEXT,
    "mainContactEmail" TEXT,
    "recruiterEmail" TEXT,
    "companyPhone" TEXT,
    "locationsServed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "logoUrl" TEXT,
    "brandColor" TEXT,
    "chatTitle" TEXT,
    "chatSubtitle" TEXT,
    "welcomeMessage" TEXT,
    "fallbackMessage" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "greetingStyle" TEXT,
    "showAiDisclosure" BOOLEAN NOT NULL DEFAULT true,
    "useEmojis" BOOLEAN NOT NULL DEFAULT false,
    "answerLength" TEXT NOT NULL DEFAULT 'concise',
    "fallbackBehavior" TEXT,
    "requiredCandidateFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "optionalCandidateFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredTransportation" TEXT,
    "requiredWorkAuthorization" TEXT,
    "requiredShiftAvailability" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minimumYearsExperience" INTEGER,
    "requiredCertifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disqualifyingAnswers" JSONB,
    "candidateScoreThreshold" INTEGER,
    "saveLeadToDashboard" BOOLEAN NOT NULL DEFAULT true,
    "sendEmailNotification" BOOLEAN NOT NULL DEFAULT false,
    "webhookUrl" TEXT,
    "redirectUrl" TEXT,
    "completionMessage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemoMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyChatbot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotJobOpening" (
    "id" TEXT NOT NULL,
    "companyChatbotId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "payRange" TEXT,
    "shift" TEXT,
    "employmentType" TEXT,
    "requirements" TEXT,
    "applicationUrl" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotJobOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotCandidateLead" (
    "id" TEXT NOT NULL,
    "companyChatbotId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "desiredJobType" TEXT,
    "employmentType" TEXT,
    "preferredShift" TEXT,
    "availability" JSONB,
    "workExperienceSummary" TEXT,
    "yearsExperience" INTEGER,
    "transportationStatus" TEXT,
    "workAuthorization" TEXT,
    "sponsorshipRequired" BOOLEAN,
    "resumeUrl" TEXT,
    "linkedinUrl" TEXT,
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "desiredPay" TEXT,
    "startDate" TEXT,
    "previousEmployer" TEXT,
    "educationLevel" TEXT,
    "languagesSpoken" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "veteranStatus" TEXT,
    "referralSource" TEXT,
    "qualificationStatus" TEXT,
    "candidateScore" INTEGER,
    "aiSummary" TEXT,
    "missingFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "structuredAnswersJson" JSONB,
    "sourcePageUrl" TEXT,
    "utmSource" TEXT,
    "utmCampaign" TEXT,
    "consentAcceptedAt" TIMESTAMP(3),
    "aiDisclosureShownAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotCandidateLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotMessage" (
    "id" TEXT NOT NULL,
    "companyChatbotId" TEXT NOT NULL,
    "leadId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatbotMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotScreeningQuestion" (
    "id" TEXT NOT NULL,
    "companyChatbotId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "questionType" TEXT NOT NULL DEFAULT 'text',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "isKnockout" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "expectedAnswer" TEXT,
    "conditionalLogic" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotScreeningQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotCandidateAnswer" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerText" TEXT,
    "answerJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotCandidateAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyChatbot_companySlug_key" ON "CompanyChatbot"("companySlug");

-- CreateIndex
CREATE INDEX "CompanyChatbot_isActive_idx" ON "CompanyChatbot"("isActive");

-- CreateIndex
CREATE INDEX "CompanyChatbot_isDemoMode_idx" ON "CompanyChatbot"("isDemoMode");

-- CreateIndex
CREATE INDEX "CompanyChatbot_createdAt_idx" ON "CompanyChatbot"("createdAt");

-- CreateIndex
CREATE INDEX "ChatbotJobOpening_companyChatbotId_idx" ON "ChatbotJobOpening"("companyChatbotId");

-- CreateIndex
CREATE INDEX "ChatbotJobOpening_companyChatbotId_status_idx" ON "ChatbotJobOpening"("companyChatbotId", "status");

-- CreateIndex
CREATE INDEX "ChatbotJobOpening_createdAt_idx" ON "ChatbotJobOpening"("createdAt");

-- CreateIndex
CREATE INDEX "ChatbotCandidateLead_companyChatbotId_idx" ON "ChatbotCandidateLead"("companyChatbotId");

-- CreateIndex
CREATE INDEX "ChatbotCandidateLead_companyChatbotId_createdAt_idx" ON "ChatbotCandidateLead"("companyChatbotId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatbotCandidateLead_email_idx" ON "ChatbotCandidateLead"("email");

-- CreateIndex
CREATE INDEX "ChatbotCandidateLead_phone_idx" ON "ChatbotCandidateLead"("phone");

-- CreateIndex
CREATE INDEX "ChatbotCandidateLead_qualificationStatus_idx" ON "ChatbotCandidateLead"("qualificationStatus");

-- CreateIndex
CREATE INDEX "ChatbotCandidateLead_createdAt_idx" ON "ChatbotCandidateLead"("createdAt");

-- CreateIndex
CREATE INDEX "ChatbotMessage_companyChatbotId_idx" ON "ChatbotMessage"("companyChatbotId");

-- CreateIndex
CREATE INDEX "ChatbotMessage_leadId_idx" ON "ChatbotMessage"("leadId");

-- CreateIndex
CREATE INDEX "ChatbotMessage_createdAt_idx" ON "ChatbotMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ChatbotScreeningQuestion_companyChatbotId_idx" ON "ChatbotScreeningQuestion"("companyChatbotId");

-- CreateIndex
CREATE INDEX "ChatbotScreeningQuestion_companyChatbotId_order_idx" ON "ChatbotScreeningQuestion"("companyChatbotId", "order");

-- CreateIndex
CREATE INDEX "ChatbotScreeningQuestion_questionType_idx" ON "ChatbotScreeningQuestion"("questionType");

-- CreateIndex
CREATE INDEX "ChatbotCandidateAnswer_leadId_idx" ON "ChatbotCandidateAnswer"("leadId");

-- CreateIndex
CREATE INDEX "ChatbotCandidateAnswer_questionId_idx" ON "ChatbotCandidateAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatbotCandidateAnswer_leadId_questionId_key" ON "ChatbotCandidateAnswer"("leadId", "questionId");

-- AddForeignKey
ALTER TABLE "ChatbotJobOpening" ADD CONSTRAINT "ChatbotJobOpening_companyChatbotId_fkey" FOREIGN KEY ("companyChatbotId") REFERENCES "CompanyChatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotCandidateLead" ADD CONSTRAINT "ChatbotCandidateLead_companyChatbotId_fkey" FOREIGN KEY ("companyChatbotId") REFERENCES "CompanyChatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotMessage" ADD CONSTRAINT "ChatbotMessage_companyChatbotId_fkey" FOREIGN KEY ("companyChatbotId") REFERENCES "CompanyChatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotMessage" ADD CONSTRAINT "ChatbotMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ChatbotCandidateLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotScreeningQuestion" ADD CONSTRAINT "ChatbotScreeningQuestion_companyChatbotId_fkey" FOREIGN KEY ("companyChatbotId") REFERENCES "CompanyChatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotCandidateAnswer" ADD CONSTRAINT "ChatbotCandidateAnswer_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ChatbotCandidateLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotCandidateAnswer" ADD CONSTRAINT "ChatbotCandidateAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ChatbotScreeningQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

