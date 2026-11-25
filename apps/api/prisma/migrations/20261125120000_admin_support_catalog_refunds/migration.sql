CREATE TABLE "PlatformCatalogService" (
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "serviceFee" DECIMAL(12,2) NOT NULL,
    "estimatedDays" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "requiresOriginals" BOOLEAN NOT NULL DEFAULT false,
    "requiredOriginals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "supportingDocuments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformCatalogService_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "PlatformPricingRule" (
    "key" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(12,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformPricingRule_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "SupportTicket" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(32) NOT NULL,
    "customerId" UUID NOT NULL,
    "orderId" UUID,
    "assignedAdminId" UUID,
    "subject" VARCHAR(160) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    "priority" VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportTicketMessage" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "internalNote" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportTicket_reference_key" ON "SupportTicket"("reference");
CREATE INDEX "SupportTicket_customerId_createdAt_idx" ON "SupportTicket"("customerId", "createdAt");
CREATE INDEX "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status", "updatedAt");
CREATE INDEX "SupportTicket_assignedAdminId_status_idx" ON "SupportTicket"("assignedAdminId", "status");
CREATE INDEX "SupportTicket_orderId_idx" ON "SupportTicket"("orderId");
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");
CREATE INDEX "SupportTicketMessage_senderId_createdAt_idx" ON "SupportTicketMessage"("senderId", "createdAt");

ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_assignedAdminId_fkey"
    FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicketMessage"
    ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicketMessage"
    ADD CONSTRAINT "SupportTicketMessage_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "PlatformCatalogService"
    ("code", "name", "description", "serviceFee", "estimatedDays", "enabled", "requiresOriginals", "requiredOriginals", "supportingDocuments", "updatedAt")
VALUES
    ('uae-embassy-degree', 'Degree certificate attestation', 'Document attestation support for education certificates and transcripts.', 180.00, 7, true, true, ARRAY['Original degree certificate', 'Original transcript'], ARRAY['Passport copy', 'Emirates ID copy'], CURRENT_TIMESTAMP),
    ('personal-document', 'Personal document attestation', 'A guided process for eligible personal and civil documents.', 140.00, 5, true, true, ARRAY['Original document to be attested'], ARRAY['Passport copy', 'Document purpose or cover note'], CURRENT_TIMESTAMP);

INSERT INTO "PlatformPricingRule" ("key", "amount", "updatedAt")
VALUES
    ('PAPER_A4_MULTIPLIER', 1.0000, CURRENT_TIMESTAMP),
    ('PAPER_A3_MULTIPLIER', 1.6000, CURRENT_TIMESTAMP),
    ('PAPER_A5_MULTIPLIER', 0.8000, CURRENT_TIMESTAMP),
    ('BLACK_WHITE_RATE', 0.5000, CURRENT_TIMESTAMP),
    ('COLOUR_RATE', 1.5000, CURRENT_TIMESTAMP),
    ('BINDING_FEE', 8.0000, CURRENT_TIMESTAMP),
    ('STAPLING_FEE', 2.0000, CURRENT_TIMESTAMP),
    ('LAMINATION_PER_PAGE', 3.0000, CURRENT_TIMESTAMP),
    ('DELIVERY_BASE', 10.0000, CURRENT_TIMESTAMP),
    ('DELIVERY_PER_KM', 1.0000, CURRENT_TIMESTAMP),
    ('EXPRESS_BASE', 12.0000, CURRENT_TIMESTAMP),
    ('EXPRESS_PER_KM', 0.5000, CURRENT_TIMESTAMP),
    ('SHOP_SERVICE_FEE', 2.0000, CURRENT_TIMESTAMP),
    ('VOLUME_DISCOUNT_MIN_PAGES', 100.0000, CURRENT_TIMESTAMP),
    ('VOLUME_DISCOUNT_RATE', 0.0500, CURRENT_TIMESTAMP),
    ('TAX_RATE', 0.0500, CURRENT_TIMESTAMP),
    ('ATTESTATION_PICKUP_BASE', 10.0000, CURRENT_TIMESTAMP),
    ('ATTESTATION_RETURN_BASE', 10.0000, CURRENT_TIMESTAMP),
    ('ATTESTATION_DELIVERY_PER_KM', 1.0000, CURRENT_TIMESTAMP),
    ('ATTESTATION_EXPRESS_FEE', 20.0000, CURRENT_TIMESTAMP),
    ('ATTESTATION_TAX_RATE', 0.0500, CURRENT_TIMESTAMP);
