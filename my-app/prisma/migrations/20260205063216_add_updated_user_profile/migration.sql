/*
  Warnings:

  - You are about to drop the column `userId` on the `Resume` table. All the data in the column will be lost.
  - You are about to drop the `JobInterests` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userProfileId]` on the table `Resume` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userProfileId` to the `Resume` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "JobInterests" DROP CONSTRAINT "JobInterests_userId_fkey";

-- DropForeignKey
ALTER TABLE "Resume" DROP CONSTRAINT "Resume_userId_fkey";

-- DropIndex
DROP INDEX "Resume_userId_key";

-- AlterTable
ALTER TABLE "Resume" DROP COLUMN "userId",
ADD COLUMN     "userProfileId" TEXT NOT NULL;

-- DropTable
DROP TABLE "JobInterests";

-- CreateTable
CREATE TABLE "JobInterest" (
    "id" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "JobInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobInterest_userProfileId_idx" ON "JobInterest"("userProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "JobInterest_userProfileId_uuid_key" ON "JobInterest"("userProfileId", "uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Resume_userProfileId_key" ON "Resume"("userProfileId");

-- AddForeignKey
ALTER TABLE "JobInterest" ADD CONSTRAINT "JobInterest_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
