-- CreateTable
CREATE TABLE "JobInterests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "JobInterests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobInterests_userId_uuid_key" ON "JobInterests"("userId", "uuid");

-- AddForeignKey
ALTER TABLE "JobInterests" ADD CONSTRAINT "JobInterests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
