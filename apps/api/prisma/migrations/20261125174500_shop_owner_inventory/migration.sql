CREATE TABLE IF NOT EXISTS "ShopInventoryItem" (
  "id" UUID NOT NULL,
  "shopId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "category" VARCHAR(60) NOT NULL,
  "unit" VARCHAR(24) NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "reorderLevel" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopInventoryItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShopInventoryItem_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ShopInventoryItem_shopId_updatedAt_idx"
  ON "ShopInventoryItem"("shopId", "updatedAt");

ALTER TABLE "ShopOpeningHour"
  ADD COLUMN IF NOT EXISTS "isClosed" BOOLEAN NOT NULL DEFAULT false;
