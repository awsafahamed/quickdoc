ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

CREATE TABLE IF NOT EXISTS "DeliveryOffer" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "riderId" UUID NOT NULL,
    "distanceKm" DECIMAL(6,2) NOT NULL,
    "earnings" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeliveryOffer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DeliveryOffer_orderId_status_idx"
    ON "DeliveryOffer"("orderId", "status");
CREATE INDEX IF NOT EXISTS "DeliveryOffer_riderId_status_createdAt_idx"
    ON "DeliveryOffer"("riderId", "status", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'DeliveryOffer_orderId_fkey'
          AND conrelid = 'public."DeliveryOffer"'::regclass
    ) THEN
        ALTER TABLE "DeliveryOffer"
        ADD CONSTRAINT "DeliveryOffer_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'DeliveryOffer_riderId_fkey'
          AND conrelid = 'public."DeliveryOffer"'::regclass
    ) THEN
        ALTER TABLE "DeliveryOffer"
        ADD CONSTRAINT "DeliveryOffer_riderId_fkey"
        FOREIGN KEY ("riderId") REFERENCES "RiderProfile"("userId")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
