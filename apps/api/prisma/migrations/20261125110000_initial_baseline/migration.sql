-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_ACCEPTANCE', 'ACCEPTED', 'REJECTED', 'PRINTING', 'READY_FOR_PICKUP', 'RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'DELIVERY_FAILED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH_ON_DELIVERY', 'ONLINE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'SHOP_OWNER', 'RIDER', 'AGENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('RESET_PASSWORD', 'VERIFY_EMAIL');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProfile" (
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

-- CreateTable
CREATE TABLE "AgentService" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "estimatedDays" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AgentService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttestationJob" (
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

-- CreateTable
CREATE TABLE "CustodyEvent" (
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

-- CreateTable
CREATE TABLE "Shop" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopStaff" (
    "shopId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "ShopStaff_pkey" PRIMARY KEY ("shopId","userId")
);

-- CreateTable
CREATE TABLE "ShopService" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ShopService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOpeningHour" (
    "shopId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" TEXT NOT NULL,
    "closesAt" TEXT NOT NULL,

    CONSTRAINT "ShopOpeningHour_pkey" PRIMARY KEY ("shopId","dayOfWeek")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "printSubtotal" DECIMAL(12,2) NOT NULL,
    "deliveryFee" DECIMAL(12,2) NOT NULL,
    "platformFee" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "commission" DECIMAL(12,2) NOT NULL,
    "deliveryAddress" JSONB NOT NULL,
    "instructions" TEXT,
    "deliveryPinHash" TEXT NOT NULL,
    "pickupCodeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveryPinEncrypted" TEXT,
    "pickupCodeEncrypted" TEXT,
    "pinAttempts" INTEGER NOT NULL DEFAULT 0,
    "clientKey" UUID,
    "checkoutFingerprint" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "userId" UUID NOT NULL,
    "phone" TEXT,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DeliveryAssignment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "riderId" UUID NOT NULL,
    "earnings" DECIMAL(12,2) NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryStatusHistory" (
    "id" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "printReadyKey" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialLedgerEntry" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "account" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "eventKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "paperSize" TEXT NOT NULL,
    "colour" BOOLEAN NOT NULL,
    "duplex" BOOLEAN NOT NULL,
    "copies" INTEGER NOT NULL,
    "pageRange" TEXT NOT NULL,
    "printedSides" INTEGER NOT NULL,
    "orientation" TEXT NOT NULL,
    "binding" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "actorId" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "gatewayReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "shopRating" INTEGER NOT NULL,
    "riderRating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderAvailability" (
    "riderId" UUID NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderAvailability_pkey" PRIMARY KEY ("riderId")
);

-- CreateTable
CREATE TABLE "RiderProfile" (
    "userId" UUID NOT NULL,
    "phone" TEXT,
    "vehicleType" TEXT,
    "registration" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" UUID NOT NULL,
    "shopId" UUID,
    "riderId" UUID,
    "agentId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopPrice" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "paperSize" TEXT NOT NULL,
    "colour" BOOLEAN NOT NULL,
    "duplex" BOOLEAN NOT NULL,
    "pricePerSide" DECIMAL(12,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","role")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_userId_key" ON "AgentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentService_agentId_code_key" ON "AgentService"("agentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AttestationJob_reference_key" ON "AttestationJob"("reference");

-- CreateIndex
CREATE INDEX "AttestationJob_agentId_status_idx" ON "AttestationJob"("agentId", "status");

-- CreateIndex
CREATE INDEX "AttestationJob_customerId_createdAt_idx" ON "AttestationJob"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustodyEvent_jobId_createdAt_idx" ON "CustodyEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "Shop_ownerId_idx" ON "Shop"("ownerId");

-- CreateIndex
CREATE INDEX "Shop_status_isOpen_idx" ON "Shop"("status", "isOpen");

-- CreateIndex
CREATE UNIQUE INDEX "ShopService_shopId_code_key" ON "ShopService"("shopId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_shopId_status_createdAt_idx" ON "Order"("shopId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_customerId_clientKey_key" ON "Order"("customerId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "ActionToken_tokenHash_key" ON "ActionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ActionToken_userId_purpose_idx" ON "ActionToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAssignment_orderId_key" ON "DeliveryAssignment"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryAssignment_riderId_assignedAt_idx" ON "DeliveryAssignment"("riderId", "assignedAt");

-- CreateIndex
CREATE INDEX "DeliveryStatusHistory_assignmentId_createdAt_idx" ON "DeliveryStatusHistory"("assignmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_objectKey_key" ON "Document"("objectKey");

-- CreateIndex
CREATE INDEX "Document_expiresAt_idx" ON "Document"("expiresAt");

-- CreateIndex
CREATE INDEX "Document_userId_idx" ON "Document"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialLedgerEntry_eventKey_key" ON "FinancialLedgerEntry"("eventKey");

-- CreateIndex
CREATE INDEX "FinancialLedgerEntry_account_createdAt_idx" ON "FinancialLedgerEntry"("account", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_documentId_idx" ON "OrderItem"("documentId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayReference_key" ON "Payment"("gatewayReference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_familyId_idx" ON "RefreshSession"("userId", "familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderId_key" ON "Review"("orderId");

-- CreateIndex
CREATE INDEX "Review_shopId_idx" ON "Review"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_reference_key" ON "Settlement"("reference");

-- CreateIndex
CREATE INDEX "Settlement_riderId_status_idx" ON "Settlement"("riderId", "status");

-- CreateIndex
CREATE INDEX "Settlement_shopId_status_idx" ON "Settlement"("shopId", "status");

-- CreateIndex
CREATE INDEX "Settlement_agentId_status_idx" ON "Settlement"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShopPrice_shopId_paperSize_colour_duplex_key" ON "ShopPrice"("shopId", "paperSize", "colour", "duplex");

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentService" ADD CONSTRAINT "AgentService_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttestationJob" ADD CONSTRAINT "AttestationJob_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AttestationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopStaff" ADD CONSTRAINT "ShopStaff_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopStaff" ADD CONSTRAINT "ShopStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopService" ADD CONSTRAINT "ShopService_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOpeningHour" ADD CONSTRAINT "ShopOpeningHour_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionToken" ADD CONSTRAINT "ActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "RiderProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryStatusHistory" ADD CONSTRAINT "DeliveryStatusHistory_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "DeliveryAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLedgerEntry" ADD CONSTRAINT "FinancialLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderAvailability" ADD CONSTRAINT "RiderAvailability_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "RiderProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderProfile" ADD CONSTRAINT "RiderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "RiderProfile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopPrice" ADD CONSTRAINT "ShopPrice_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
