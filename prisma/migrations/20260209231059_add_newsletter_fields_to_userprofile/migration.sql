-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "newsletterOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "newsletterSource" TEXT,
ADD COLUMN     "unsubscribedAt" TIMESTAMP(3);
