CREATE TYPE "ServiceReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "AgentService"
  ADD COLUMN "description" VARCHAR(1000) NOT NULL DEFAULT '',
  ADD COLUMN "isCustom" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reviewStatus" "ServiceReviewStatus" NOT NULL DEFAULT 'APPROVED';

ALTER TABLE "ShopService"
  ADD COLUMN "name" VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN "description" VARCHAR(1000) NOT NULL DEFAULT '',
  ADD COLUMN "isCustom" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reviewStatus" "ServiceReviewStatus" NOT NULL DEFAULT 'APPROVED';

UPDATE "ShopService"
SET "name" = INITCAP(REPLACE(LOWER("code"), '_', ' '))
WHERE "name" = '';

ALTER TABLE "Order"
  ADD COLUMN "shopServiceSnapshot" JSONB;

ALTER TABLE "AttestationJob"
  ADD COLUMN "serviceName" TEXT;

CREATE INDEX "AgentService_reviewStatus_enabled_idx"
  ON "AgentService"("reviewStatus", "enabled");

CREATE INDEX "ShopService_reviewStatus_enabled_idx"
  ON "ShopService"("reviewStatus", "enabled");
