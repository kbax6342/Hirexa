ALTER TABLE "UserProfile"
ADD COLUMN "citySearch" TEXT,
ADD COLUMN "dobEncrypted" TEXT,
ADD COLUMN "postalCodeSearch" TEXT,
ADD COLUMN "stateSearch" TEXT;

CREATE INDEX "UserProfile_citySearch_idx" ON "UserProfile"("citySearch");
CREATE INDEX "UserProfile_stateSearch_idx" ON "UserProfile"("stateSearch");
CREATE INDEX "UserProfile_postalCodeSearch_idx" ON "UserProfile"("postalCodeSearch");

UPDATE "UserProfile"
SET "citySearch" = lower(regexp_replace(trim("city"), '[^a-zA-Z0-9\s]+', ' ', 'g'))
WHERE "citySearch" IS NULL
  AND "city" IS NOT NULL
  AND char_length(trim("city")) BETWEEN 1 AND 80
  AND trim("city") NOT LIKE 'enc:v1:%'
  AND trim("city") !~ '^[A-Za-z0-9+/_=-]{64,}$';

UPDATE "UserProfile"
SET "stateSearch" = lower(regexp_replace(trim("state"), '[^a-zA-Z0-9\s]+', ' ', 'g'))
WHERE "stateSearch" IS NULL
  AND "state" IS NOT NULL
  AND char_length(trim("state")) BETWEEN 1 AND 80
  AND trim("state") NOT LIKE 'enc:v1:%'
  AND trim("state") !~ '^[A-Za-z0-9+/_=-]{64,}$';

UPDATE "UserProfile"
SET "postalCodeSearch" = lower(regexp_replace(trim("postalCode"), '[^a-zA-Z0-9]+', '', 'g'))
WHERE "postalCodeSearch" IS NULL
  AND "postalCode" IS NOT NULL
  AND char_length(trim("postalCode")) BETWEEN 3 AND 20
  AND trim("postalCode") NOT LIKE 'enc:v1:%'
  AND trim("postalCode") !~ '^[A-Za-z0-9+/_=-]{64,}$';
