-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "newsletterOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "newsletterSource" TEXT;
