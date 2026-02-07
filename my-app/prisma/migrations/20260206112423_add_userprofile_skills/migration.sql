-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "resumeSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];
