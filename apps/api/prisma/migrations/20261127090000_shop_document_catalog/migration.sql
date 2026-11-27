CREATE TABLE "ShopCatalogFolder" (
  "id" UUID NOT NULL,
  "shopId" UUID NOT NULL,
  "parentId" UUID,
  "name" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopCatalogFolder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShopCatalogFolder_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShopCatalogFolder_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "ShopCatalogFolder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ShopCatalogDocument" (
  "id" UUID NOT NULL,
  "shopId" UUID NOT NULL,
  "folderId" UUID,
  "objectKey" TEXT NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" VARCHAR(1000) NOT NULL DEFAULT '',
  "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  "sizeBytes" INTEGER NOT NULL,
  "pageCount" INTEGER,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopCatalogDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShopCatalogDocument_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShopCatalogDocument_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "ShopCatalogFolder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ShopCatalogDocument_objectKey_key"
  ON "ShopCatalogDocument"("objectKey");
CREATE INDEX "ShopCatalogFolder_shopId_parentId_name_idx"
  ON "ShopCatalogFolder"("shopId", "parentId", "name");
CREATE INDEX "ShopCatalogDocument_shopId_folderId_isPublished_idx"
  ON "ShopCatalogDocument"("shopId", "folderId", "isPublished");
CREATE INDEX "ShopCatalogDocument_name_idx"
  ON "ShopCatalogDocument"("name");
