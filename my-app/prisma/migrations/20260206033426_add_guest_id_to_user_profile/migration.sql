/*
  Warnings:

  - A unique constraint covering the columns `[guestId]` on the table `UserProfile` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "guestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_guestId_key" ON "UserProfile"("guestId");
