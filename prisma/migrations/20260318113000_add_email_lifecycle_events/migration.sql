CREATE TABLE "EmailLifecycleEvent" (
    "id" TEXT NOT NULL,
    "userProfileId" TEXT,
    "email" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventGroup" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "EmailLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailLifecycleEvent_dedupeKey_key" ON "EmailLifecycleEvent"("dedupeKey");
CREATE INDEX "EmailLifecycleEvent_userProfileId_eventGroup_idx" ON "EmailLifecycleEvent"("userProfileId", "eventGroup");
CREATE INDEX "EmailLifecycleEvent_email_eventGroup_idx" ON "EmailLifecycleEvent"("email", "eventGroup");
CREATE INDEX "EmailLifecycleEvent_sentAt_idx" ON "EmailLifecycleEvent"("sentAt");

ALTER TABLE "EmailLifecycleEvent"
ADD CONSTRAINT "EmailLifecycleEvent_userProfileId_fkey"
FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
