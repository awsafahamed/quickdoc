ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'AGENT';

ALTER TABLE "Settlement"
ADD COLUMN IF NOT EXISTS "agentId" UUID;

CREATE TABLE IF NOT EXISTS "AgentProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "businessName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentService" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "estimatedDays" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "AgentService_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AttestationJob" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "agentId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PICKUP_SCHEDULED',
    "pickupAddress" JSONB NOT NULL,
    "returnAddress" JSONB NOT NULL,
    "estimatedReadyAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttestationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustodyEvent" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "note" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgentProfile_userId_key" ON "AgentProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentService_agentId_code_key" ON "AgentService"("agentId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "AttestationJob_reference_key" ON "AttestationJob"("reference");
CREATE INDEX IF NOT EXISTS "AttestationJob_agentId_status_idx" ON "AttestationJob"("agentId", "status");
CREATE INDEX IF NOT EXISTS "AttestationJob_customerId_createdAt_idx" ON "AttestationJob"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "CustodyEvent_jobId_createdAt_idx" ON "CustodyEvent"("jobId", "createdAt");
CREATE INDEX IF NOT EXISTS "Settlement_agentId_status_idx" ON "Settlement"("agentId", "status");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'AgentProfile_userId_fkey'
          AND conrelid = 'public."AgentProfile"'::regclass
    ) THEN
        ALTER TABLE "AgentProfile"
        ADD CONSTRAINT "AgentProfile_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'AgentService_agentId_fkey'
          AND conrelid = 'public."AgentService"'::regclass
    ) THEN
        ALTER TABLE "AgentService"
        ADD CONSTRAINT "AgentService_agentId_fkey"
        FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'AttestationJob_agentId_fkey'
          AND conrelid = 'public."AttestationJob"'::regclass
    ) THEN
        ALTER TABLE "AttestationJob"
        ADD CONSTRAINT "AttestationJob_agentId_fkey"
        FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'CustodyEvent_jobId_fkey'
          AND conrelid = 'public."CustodyEvent"'::regclass
    ) THEN
        ALTER TABLE "CustodyEvent"
        ADD CONSTRAINT "CustodyEvent_jobId_fkey"
        FOREIGN KEY ("jobId") REFERENCES "AttestationJob"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Settlement_agentId_fkey'
          AND conrelid = '"Settlement"'::regclass
    ) THEN
        ALTER TABLE "Settlement"
        ADD CONSTRAINT "Settlement_agentId_fkey"
        FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;
