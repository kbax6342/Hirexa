ALTER TABLE "ApplySiteStrategy"
ADD COLUMN IF NOT EXISTS "strategyKey" TEXT,
ADD COLUMN IF NOT EXISTS "sourceHost" TEXT,
ADD COLUMN IF NOT EXISTS "destinationHost" TEXT,
ADD COLUMN IF NOT EXISTS "strategyType" TEXT NOT NULL DEFAULT 'generic_navigation',
ADD COLUMN IF NOT EXISTS "pageType" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS "supportedReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "rawStepsJson" JSONB,
ADD COLUMN IF NOT EXISTS "sanitizedStepsJson" JSONB,
ADD COLUMN IF NOT EXISTS "jobTitle" TEXT,
ADD COLUMN IF NOT EXISTS "company" TEXT,
ADD COLUMN IF NOT EXISTS "location" TEXT,
ADD COLUMN IF NOT EXISTS "derivedInstruction" TEXT,
ADD COLUMN IF NOT EXISTS "automationPrompt" TEXT,
ADD COLUMN IF NOT EXISTS "successfulReplays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "failedReplays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "replayStatus" TEXT,
ADD COLUMN IF NOT EXISTS "lastReplayResult" JSONB,
ADD COLUMN IF NOT EXISTS "failingStepId" TEXT,
ADD COLUMN IF NOT EXISTS "lastReplayAt" TIMESTAMP(3);

UPDATE "ApplySiteStrategy"
SET
  "sourceHost" = COALESCE(NULLIF("sourceHost", ''), "hostname"),
  "rawStepsJson" = COALESCE("rawStepsJson", "stepsJson"),
  "sanitizedStepsJson" = COALESCE("sanitizedStepsJson", "stepsJson"),
  "successfulReplays" = CASE
    WHEN "successfulReplays" > 0 THEN "successfulReplays"
    ELSE "successCount"
  END,
  "failedReplays" = CASE
    WHEN "failedReplays" > 0 THEN "failedReplays"
    ELSE "failureCount"
  END,
  "lastReplayAt" = COALESCE("lastReplayAt", "lastReplayedAt");

UPDATE "ApplySiteStrategy"
SET "strategyKey" = CONCAT_WS(
  '::',
  COALESCE(NULLIF(LOWER("sourceHost"), ''), LOWER("hostname"), 'unknown-source'),
  COALESCE(NULLIF(LOWER("destinationHost"), ''), LOWER("hostname"), 'unknown-destination'),
  COALESCE(NULLIF(LOWER("strategyType"), ''), 'generic_navigation'),
  COALESCE(NULLIF(LOWER("pageType"), ''), 'unknown'),
  'any-company',
  'any-title',
  'any-location'
)
WHERE "strategyKey" IS NULL;

ALTER TABLE "ApplySiteStrategy"
ALTER COLUMN "strategyKey" SET NOT NULL;

DROP INDEX IF EXISTS "ApplySiteStrategy_userProfileId_hostname_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ApplySiteStrategy_userProfileId_strategyKey_key"
ON "ApplySiteStrategy"("userProfileId", "strategyKey");

CREATE INDEX IF NOT EXISTS "ApplySiteStrategy_sourceHost_idx"
ON "ApplySiteStrategy"("sourceHost");

CREATE INDEX IF NOT EXISTS "ApplySiteStrategy_destinationHost_idx"
ON "ApplySiteStrategy"("destinationHost");

CREATE INDEX IF NOT EXISTS "ApplySiteStrategy_userProfileId_sourceHost_pageType_strategyType_idx"
ON "ApplySiteStrategy"("userProfileId", "sourceHost", "pageType", "strategyType");
