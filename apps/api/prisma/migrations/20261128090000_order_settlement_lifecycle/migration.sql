-- Order and attestation money lifecycle: settlements are linked to the work they pay for,
-- typed as partner payouts or rider cash remittances, and created idempotently.
-- Written to be safe to re-run against databases that already contain some of these objects.

ALTER TABLE "AttestationJob" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);

ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "attestationJobId" UUID;
ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "kind" VARCHAR(24) NOT NULL DEFAULT 'PAYOUT';
ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "note" VARCHAR(500);
ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "orderId" UUID;
ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Settlement_idempotencyKey_key" ON "Settlement"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "Settlement_orderId_idx" ON "Settlement"("orderId");
CREATE INDEX IF NOT EXISTS "Settlement_attestationJobId_idx" ON "Settlement"("attestationJobId");
CREATE INDEX IF NOT EXISTS "Settlement_status_createdAt_idx" ON "Settlement"("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Settlement_orderId_fkey') THEN
    ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Settlement_attestationJobId_fkey') THEN
    ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_attestationJobId_fkey"
      FOREIGN KEY ("attestationJobId") REFERENCES "AttestationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- One bank transfer or receipt can cover several settlements, so payout references are not unique.
DROP INDEX IF EXISTS "Settlement_reference_key";
CREATE INDEX IF NOT EXISTS "Settlement_reference_idx" ON "Settlement"("reference");
