-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "includeRemote" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "workplaceLocations" JSONB;
