ALTER TABLE "UserProfile"
ADD COLUMN "profileImage" BYTEA,
ADD COLUMN "profileImageMimeType" TEXT,
ADD COLUMN "profileImageFilename" TEXT;
