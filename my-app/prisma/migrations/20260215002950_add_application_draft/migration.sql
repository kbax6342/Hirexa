-- CreateTable
CREATE TABLE "ApplicationDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "profileId" TEXT,
    "jobId" TEXT NOT NULL,
    "jobUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "fullName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "workAuth" TEXT,
    "linkedin" TEXT,
    "portfolio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAnswer" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationDraft_jobId_idx" ON "ApplicationDraft"("jobId");

-- CreateIndex
CREATE INDEX "ApplicationDraft_userId_idx" ON "ApplicationDraft"("userId");

-- CreateIndex
CREATE INDEX "ApplicationDraft_guestId_idx" ON "ApplicationDraft"("guestId");

-- CreateIndex
CREATE INDEX "ApplicationAnswer_draftId_idx" ON "ApplicationAnswer"("draftId");

-- CreateIndex
CREATE INDEX "ApplicationAnswer_draftId_key_idx" ON "ApplicationAnswer"("draftId", "key");

-- AddForeignKey
ALTER TABLE "ApplicationAnswer" ADD CONSTRAINT "ApplicationAnswer_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ApplicationDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
