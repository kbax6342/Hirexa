ALTER TABLE "UserProfile"
ADD COLUMN "registrationStatus" TEXT NOT NULL DEFAULT 'pending_verification';
