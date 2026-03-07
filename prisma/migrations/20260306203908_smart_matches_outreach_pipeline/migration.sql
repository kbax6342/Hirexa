-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "portfolioUrl" TEXT;

-- CreateTable
CREATE TABLE "LinkedInAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'linkedin_sim',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedName" TEXT,
    "importedHeadline" TEXT,
    "importedLocation" TEXT,
    "importedSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedInAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachCampaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetCompanies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "location" TEXT,
    "dailyLimit" INTEGER NOT NULL DEFAULT 10,
    "autoFollowUp" BOOLEAN NOT NULL DEFAULT true,
    "followUpDays" INTEGER NOT NULL DEFAULT 5,
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "shortBio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachTemplate" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterLead" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "outreachJobTargetId" TEXT,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "linkedinUrl" TEXT NOT NULL,
    "connectionLevel" TEXT NOT NULL DEFAULT '2nd',
    "status" TEXT NOT NULL DEFAULT 'READY',
    "lastMessagedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruiterLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "templateId" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachJobTarget" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "leadsFound" INTEGER NOT NULL DEFAULT 0,
    "messagesSent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachJobTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitSelection" (
    "id" TEXT NOT NULL,
    "userProfileId" TEXT,
    "guestId" TEXT,
    "selectedPlan" TEXT NOT NULL,
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenefitSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobHunterPack" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "userId" TEXT,
    "jobId" TEXT,
    "jobTitle" TEXT,
    "company" TEXT,
    "jobUrl" TEXT,
    "jobDescription" TEXT,
    "resumeText" TEXT,
    "notes" TEXT,
    "optimizedResume" TEXT,
    "coverLetter" TEXT,
    "interviewPrep" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobHunterPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "guestId" TEXT NOT NULL,
    "userId" TEXT,
    "amount" INTEGER,
    "currency" TEXT,
    "stripeSessionId" TEXT,
    "stripePaymentId" TEXT,
    "packId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInAccount_userId_key" ON "LinkedInAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachCampaign_userId_key" ON "OutreachCampaign"("userId");

-- CreateIndex
CREATE INDEX "RecruiterLead_campaignId_idx" ON "RecruiterLead"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "RecruiterLead_campaignId_linkedinUrl_key" ON "RecruiterLead"("campaignId", "linkedinUrl");

-- CreateIndex
CREATE INDEX "OutreachMessage_leadId_idx" ON "OutreachMessage"("leadId");

-- CreateIndex
CREATE INDEX "OutreachJobTarget_userId_idx" ON "OutreachJobTarget"("userId");

-- CreateIndex
CREATE INDEX "OutreachJobTarget_campaignId_idx" ON "OutreachJobTarget"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachJobTarget_userId_jobId_key" ON "OutreachJobTarget"("userId", "jobId");

-- CreateIndex
CREATE INDEX "BenefitSelection_userProfileId_idx" ON "BenefitSelection"("userProfileId");

-- CreateIndex
CREATE INDEX "BenefitSelection_guestId_idx" ON "BenefitSelection"("guestId");

-- CreateIndex
CREATE INDEX "JobHunterPack_guestId_idx" ON "JobHunterPack"("guestId");

-- CreateIndex
CREATE INDEX "JobHunterPack_userId_idx" ON "JobHunterPack"("userId");

-- CreateIndex
CREATE INDEX "JobHunterPack_status_idx" ON "JobHunterPack"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_stripeSessionId_key" ON "Purchase"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_packId_key" ON "Purchase"("packId");

-- CreateIndex
CREATE INDEX "Purchase_guestId_idx" ON "Purchase"("guestId");

-- CreateIndex
CREATE INDEX "Purchase_userId_idx" ON "Purchase"("userId");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

-- AddForeignKey
ALTER TABLE "OutreachTemplate" ADD CONSTRAINT "OutreachTemplate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "OutreachCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterLead" ADD CONSTRAINT "RecruiterLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "OutreachCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterLead" ADD CONSTRAINT "RecruiterLead_outreachJobTargetId_fkey" FOREIGN KEY ("outreachJobTargetId") REFERENCES "OutreachJobTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "RecruiterLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachJobTarget" ADD CONSTRAINT "OutreachJobTarget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "OutreachCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitSelection" ADD CONSTRAINT "BenefitSelection_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_packId_fkey" FOREIGN KEY ("packId") REFERENCES "JobHunterPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
