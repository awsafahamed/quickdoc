const bcrypt = require('bcryptjs');
const { createHash } = require('node:crypto');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');

const envFile = [resolve(__dirname, '../.env'), resolve(__dirname, '../../../.env')]
  .find(existsSync);
if (envFile) require('dotenv').config({ path: envFile });

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'QuickDocDemo2026!';
const prisma = new PrismaClient();
const ids = {
  admin: '10000000-0000-4000-8000-000000000001',
  customer: '10000000-0000-4000-8000-000000000002',
  shopOwner: '10000000-0000-4000-8000-000000000003',
  pendingShopOwner: '10000000-0000-4000-8000-000000000004',
  rider: '10000000-0000-4000-8000-000000000005',
  agent: '10000000-0000-4000-8000-000000000006',
  approvedShop: '20000000-0000-4000-8000-000000000001',
  pendingShop: '20000000-0000-4000-8000-000000000002',
  agentProfile: '30000000-0000-4000-8000-000000000001',
  document1: '40000000-0000-4000-8000-000000000001',
  document2: '40000000-0000-4000-8000-000000000002',
  document3: '40000000-0000-4000-8000-000000000003',
  order1: '50000000-0000-4000-8000-000000000001',
  order2: '50000000-0000-4000-8000-000000000002',
  order3: '50000000-0000-4000-8000-000000000003',
  assignment: '60000000-0000-4000-8000-000000000001',
  ticket: '70000000-0000-4000-8000-000000000001',
  job: '80000000-0000-4000-8000-000000000001',
};

const accounts = [
  { key: 'admin', email: 'admin@quickdoc.test', name: 'Demo Administrator', role: 'ADMIN' },
  { key: 'customer', email: 'customer@quickdoc.test', name: 'Demo Customer', role: 'CUSTOMER' },
  { key: 'shopOwner', email: 'shop@quickdoc.test', name: 'Demo Print Shop', role: 'SHOP_OWNER' },
  { key: 'pendingShopOwner', email: 'pending-shop@quickdoc.test', name: 'Pending Print Shop', role: 'SHOP_OWNER' },
  { key: 'rider', email: 'rider@quickdoc.test', name: 'Demo Rider', role: 'RIDER' },
  { key: 'agent', email: 'agent@quickdoc.test', name: 'Demo Attestation Agent', role: 'AGENT' },
];

const printServices = [
  ['PAPER_A4', 0.5],
  ['PAPER_A3', 1.5],
  ['BLACK_WHITE', 0.5],
  ['COLOUR', 1.5],
  ['DUPLEX', 0.25],
  ['STAPLING', 2],
  ['BINDING', 8],
  ['LAMINATION', 3],
];

const pricingRules = {
  PAPER_A4_MULTIPLIER: 1,
  PAPER_A3_MULTIPLIER: 1.6,
  PAPER_A5_MULTIPLIER: 0.8,
  BLACK_WHITE_RATE: 0.5,
  COLOUR_RATE: 1.5,
  BINDING_FEE: 8,
  STAPLING_FEE: 2,
  LAMINATION_PER_PAGE: 3,
  DELIVERY_BASE: 10,
  DELIVERY_PER_KM: 1,
  EXPRESS_BASE: 12,
  EXPRESS_PER_KM: 0.5,
  SHOP_SERVICE_FEE: 2,
  VOLUME_DISCOUNT_MIN_PAGES: 100,
  VOLUME_DISCOUNT_RATE: 0.05,
  TAX_RATE: 0.05,
  ATTESTATION_PICKUP_BASE: 10,
  ATTESTATION_RETURN_BASE: 10,
  ATTESTATION_DELIVERY_PER_KM: 1,
  ATTESTATION_EXPRESS_FEE: 20,
  ATTESTATION_TAX_RATE: 0.05,
};

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function hashCode(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  for (const account of accounts) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      create: {
        id: ids[account.key],
        email: account.email,
        name: account.name,
        passwordHash,
        emailVerified: true,
        UserRole: { create: { role: account.role } },
      },
      update: { name: account.name, passwordHash, emailVerified: true, suspended: false },
    });
    ids[account.key] = user.id;
    await prisma.userRole.upsert({
      where: { userId_role: { userId: user.id, role: account.role } },
      create: { userId: user.id, role: account.role },
      update: {},
    });
  }

  await prisma.customerProfile.upsert({
    where: { userId: ids.customer },
    create: { userId: ids.customer, phone: '+94771234567' },
    update: { phone: '+94771234567' },
  });
  await prisma.address.upsert({
    where: { id: '90000000-0000-4000-8000-000000000001' },
    create: {
      id: '90000000-0000-4000-8000-000000000001',
      userId: ids.customer,
      label: 'Home',
      line: '12 Galle Road, Colombo 03, Sri Lanka',
      latitude: 6.9147,
      longitude: 79.848,
      updatedAt: daysAgo(10),
    },
    update: { label: 'Home', line: '12 Galle Road, Colombo 03, Sri Lanka' },
  });
}

async function seedShops() {
  const shops = [
    {
      id: ids.approvedShop,
      ownerId: ids.shopOwner,
      name: 'QuickPrint Colombo',
      address: '45 Union Place, Colombo 02, Sri Lanka',
      phone: '+94112345678',
      latitude: 6.9147,
      longitude: 79.848,
      status: 'APPROVED',
      isOpen: true,
    },
    {
      id: ids.pendingShop,
      ownerId: ids.pendingShopOwner,
      name: 'Demo Copy Centre',
      address: '8 Main Street, Colombo 11, Sri Lanka',
      phone: '+94112345679',
      latitude: 6.935,
      longitude: 79.85,
      status: 'PENDING',
      isOpen: false,
    },
  ];

  for (const shop of shops) {
    await prisma.shop.upsert({
      where: { id: shop.id },
      create: shop,
      update: shop,
    });
  }

  for (const [code, price] of printServices) {
    await prisma.shopService.upsert({
      where: { shopId_code: { shopId: ids.approvedShop, code } },
      create: { shopId: ids.approvedShop, code, enabled: true, price },
      update: { enabled: true, price },
    });
  }

  for (const [index, paperSize, colour, duplex, pricePerSide] of [
    [1, 'A4', false, false, 0.5],
    [2, 'A4', true, false, 1.5],
    [3, 'A4', false, true, 0.25],
    [4, 'A3', false, false, 1.5],
  ]) {
    const id = `a0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    await prisma.shopPrice.upsert({
      where: {
        shopId_paperSize_colour_duplex: {
          shopId: ids.approvedShop,
          paperSize,
          colour,
          duplex,
        },
      },
      create: { id, shopId: ids.approvedShop, paperSize, colour, duplex, pricePerSide, updatedAt: new Date() },
      update: { pricePerSide, updatedAt: new Date() },
    });
  }

  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    await prisma.shopOpeningHour.upsert({
      where: { shopId_dayOfWeek: { shopId: ids.approvedShop, dayOfWeek } },
      create: { shopId: ids.approvedShop, dayOfWeek, opensAt: '08:00', closesAt: '20:00' },
      update: { opensAt: '08:00', closesAt: '20:00' },
    });
  }

}

async function seedCatalog() {
  const services = [
    {
      code: 'degree-attestation',
      name: 'Degree certificate attestation',
      description: 'Verification and attestation of an academic degree certificate.',
      serviceFee: 4500,
      estimatedDays: 7,
      requiresOriginals: true,
      requiredOriginals: ['Original degree certificate'],
      supportingDocuments: ['National identity document'],
    },
    {
      code: 'birth-certificate-copy',
      name: 'Certified birth certificate copy',
      description: 'Request and delivery coordination for a certified birth certificate copy.',
      serviceFee: 2500,
      estimatedDays: 5,
      requiresOriginals: false,
      requiredOriginals: [],
      supportingDocuments: ['Applicant identity document', 'Birth details'],
    },
    {
      code: 'document-legalization',
      name: 'Document legalization',
      description: 'Document review and legalization coordination.',
      serviceFee: 6000,
      estimatedDays: 10,
      requiresOriginals: true,
      requiredOriginals: ['Original document'],
      supportingDocuments: ['National identity document'],
    },
  ];

  for (const service of services) {
    await prisma.platformCatalogService.upsert({
      where: { code: service.code },
      create: { ...service, enabled: true },
      update: { ...service, enabled: true },
    });
  }

  for (const [key, amount] of Object.entries(pricingRules)) {
    await prisma.platformPricingRule.upsert({
      where: { key },
      create: { key, amount, updatedAt: new Date() },
      update: { amount, updatedAt: new Date() },
    });
  }

  for (const [key, value] of [
    ['currency', 'LKR'],
    ['country', 'Sri Lanka'],
  ]) {
    await prisma.adminSetting.upsert({
      where: { key },
      create: { key, value, updatedAt: new Date() },
      update: { value, updatedAt: new Date() },
    });
  }
}

async function seedPartnerProfiles() {
  await prisma.riderProfile.upsert({
    where: { userId: ids.rider },
    create: {
      userId: ids.rider,
      phone: '+94777654321',
      vehicleType: 'BIKE',
      registration: 'WP-BIKE-042',
      status: 'APPROVED',
      updatedAt: daysAgo(2),
    },
    update: {
      phone: '+94777654321',
      vehicleType: 'BIKE',
      registration: 'WP-BIKE-042',
      status: 'APPROVED',
      updatedAt: new Date(),
    },
  });
  await prisma.riderAvailability.upsert({
    where: { riderId: ids.rider },
    create: { riderId: ids.rider, online: true, latitude: 6.9147, longitude: 79.848, updatedAt: new Date() },
    update: { online: true, latitude: 6.9147, longitude: 79.848, updatedAt: new Date() },
  });

  const agentProfile = await prisma.agentProfile.upsert({
    where: { userId: ids.agent },
    create: {
      id: ids.agentProfile,
      userId: ids.agent,
      businessName: 'ClearPath Document Services',
      address: '21 Ward Place, Colombo 07, Sri Lanka',
      phone: '+94112345680',
      status: 'APPROVED',
      isOpen: true,
    },
    update: {
      businessName: 'ClearPath Document Services',
      address: '21 Ward Place, Colombo 07, Sri Lanka',
      phone: '+94112345680',
      status: 'APPROVED',
      isOpen: true,
    },
  });
  ids.agentProfile = agentProfile.id;

  for (const [code, name, price, estimatedDays] of [
    ['degree-attestation', 'Degree certificate attestation', 4500, 7],
    ['birth-certificate-copy', 'Certified birth certificate copy', 2500, 5],
    ['document-legalization', 'Document legalization', 6000, 10],
  ]) {
    await prisma.agentService.upsert({
      where: { agentId_code: { agentId: ids.agentProfile, code } },
      create: { agentId: ids.agentProfile, code, name, price, estimatedDays, enabled: true },
      update: { name, price, estimatedDays, enabled: true },
    });
  }
}

async function seedOrders() {
  const documents = [
    { id: ids.document1, name: 'Business-plan-demo.pdf', objectKey: 'demo/customer/business-plan-demo.pdf', sizeBytes: 240000, pageCount: 12 },
    { id: ids.document2, name: 'Course-notes-demo.pdf', objectKey: 'demo/customer/course-notes-demo.pdf', sizeBytes: 510000, pageCount: 28 },
    { id: ids.document3, name: 'Resume-demo.pdf', objectKey: 'demo/customer/resume-demo.pdf', sizeBytes: 95000, pageCount: 3 },
  ];
  for (const document of documents) {
    await prisma.document.upsert({
      where: { id: document.id },
      create: {
        ...document,
        userId: ids.customer,
        mimeType: 'application/pdf',
        scanStatus: 'DEMO',
        expiresAt: daysAgo(-30),
        updatedAt: daysAgo(1),
      },
      update: {
        ...document,
        userId: ids.customer,
        mimeType: 'application/pdf',
        scanStatus: 'DEMO',
        expiresAt: daysAgo(-30),
        updatedAt: new Date(),
      },
    });
  }

  const orders = [
    {
      id: ids.order1,
      reference: 'QD-DEMO-1001',
      status: 'RIDER_ASSIGNED',
      documentId: ids.document1,
      total: 99.75,
      createdDaysAgo: 1,
      item: { paperSize: 'A4', colour: false, duplex: true, copies: 2, printedSides: 24, orientation: 'PORTRAIT', binding: 'BINDING', stapling: false, lamination: false },
      paymentStatus: 'PENDING',
    },
    {
      id: ids.order2,
      reference: 'QD-DEMO-1002',
      status: 'PRINTING',
      documentId: ids.document2,
      total: 83.5,
      createdDaysAgo: 2,
      item: { paperSize: 'A4', colour: true, duplex: false, copies: 1, printedSides: 28, orientation: 'PORTRAIT', binding: null, stapling: true, lamination: false },
      paymentStatus: 'PENDING',
    },
    {
      id: ids.order3,
      reference: 'QD-DEMO-1003',
      status: 'DELIVERED',
      documentId: ids.document3,
      total: 25.2,
      createdDaysAgo: 12,
      item: { paperSize: 'A4', colour: false, duplex: false, copies: 2, printedSides: 6, orientation: 'PORTRAIT', binding: null, stapling: false, lamination: false },
      paymentStatus: 'PAID',
    },
  ];

  for (const [index, order] of orders.entries()) {
    const createdAt = daysAgo(order.createdDaysAgo);
    const printSubtotal = order.total - 12;
    await prisma.order.upsert({
      where: { id: order.id },
      create: {
        id: order.id,
        reference: order.reference,
        customerId: ids.customer,
        shopId: ids.approvedShop,
        status: order.status,
        currency: 'LKR',
        printSubtotal,
        deliveryFee: 10,
        platformFee: 2,
        total: order.total,
        commission: Number((printSubtotal * 0.1).toFixed(2)),
        deliverySpeed: index === 1 ? 'EXPRESS' : 'STANDARD',
        deliveryDistanceKm: 3.5,
        deliveryAddress: { line: '12 Galle Road, Colombo 03, Sri Lanka' },
        instructions: index === 0 ? 'Leave at the front desk.' : null,
        deliveryPinHash: hashCode('D4E5F6'),
        pickupCodeHash: hashCode('A1B2C3'),
        clientKey: `90000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        createdAt,
        updatedAt: createdAt,
      },
      update: {
        customerId: ids.customer,
        shopId: ids.approvedShop,
        status: order.status,
        printSubtotal,
        deliveryFee: 10,
        platformFee: 2,
        total: order.total,
        updatedAt: createdAt,
      },
    });

    const item = order.item;
    await prisma.orderItem.upsert({
      where: { id: `b0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` },
      create: {
        id: `b0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        orderId: order.id,
        documentId: order.documentId,
        ...item,
        pageRange: 'ALL',
        unitPrice: printSubtotal / item.copies,
        total: printSubtotal,
      },
      update: { ...item, pageRange: 'ALL', unitPrice: printSubtotal / item.copies, total: printSubtotal },
    });

    const historyId = `c0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    await prisma.orderStatusHistory.upsert({
      where: { id: historyId },
      create: { id: historyId, orderId: order.id, status: order.status, actorId: ids.customer, createdAt },
      update: { status: order.status, createdAt },
    });

    const paymentId = `d0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    await prisma.payment.upsert({
      where: { orderId: order.id },
      create: {
        id: paymentId,
        orderId: order.id,
        method: index === 2 ? 'ONLINE' : 'CASH_ON_DELIVERY',
        status: order.paymentStatus,
        amount: order.total,
        gatewayReference: index === 2 ? 'DEMO-PAY-1003' : null,
        idempotencyKey: `demo-payment-${index + 1}`,
        createdAt,
        updatedAt: createdAt,
      },
      update: { status: order.paymentStatus, amount: order.total, updatedAt: createdAt },
    });

    await prisma.financialLedgerEntry.upsert({
      where: { eventKey: `demo-order-${order.reference}` },
      create: {
        id: `e0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        orderId: order.id,
        account: 'SHOP_PAYABLE',
        amount: printSubtotal - Number((printSubtotal * 0.1).toFixed(2)),
        currency: 'LKR',
        eventKey: `demo-order-${order.reference}`,
        createdAt,
      },
      update: { amount: printSubtotal - Number((printSubtotal * 0.1).toFixed(2)) },
    });
  }

  const activeAssignment = await prisma.deliveryAssignment.upsert({
    where: { orderId: ids.order1 },
    create: {
      id: ids.assignment,
      orderId: ids.order1,
      riderId: ids.rider,
      earnings: 125,
      assignedAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
    update: { riderId: ids.rider, earnings: 125, updatedAt: new Date() },
  });
  ids.assignment = activeAssignment.id;
  await prisma.deliveryStatusHistory.upsert({
    where: { id: 'f0000000-0000-4000-8000-000000000001' },
    create: {
      id: 'f0000000-0000-4000-8000-000000000001',
      assignmentId: activeAssignment.id,
      status: 'OFFERED',
      createdAt: daysAgo(1),
    },
    update: { assignmentId: activeAssignment.id, status: 'OFFERED' },
  });
  const deliveredAssignment = await prisma.deliveryAssignment.upsert({
    where: { orderId: ids.order3 },
    create: {
      id: '60000000-0000-4000-8000-000000000003',
      orderId: ids.order3,
      riderId: ids.rider,
      earnings: 125,
      assignedAt: daysAgo(12),
      updatedAt: daysAgo(12),
    },
    update: { riderId: ids.rider, earnings: 125, updatedAt: daysAgo(12) },
  });
  await prisma.deliveryStatusHistory.upsert({
    where: { id: 'f0000000-0000-4000-8000-000000000003' },
    create: {
      id: 'f0000000-0000-4000-8000-000000000003',
      assignmentId: deliveredAssignment.id,
      status: 'DELIVERED',
      createdAt: daysAgo(12),
    },
    update: { assignmentId: deliveredAssignment.id, status: 'DELIVERED' },
  });

  await prisma.review.upsert({
    where: { orderId: ids.order3 },
    create: {
      id: 'a1000000-0000-4000-8000-000000000003',
      orderId: ids.order3,
      userId: ids.customer,
      shopId: ids.approvedShop,
      shopRating: 5,
      riderRating: 5,
      comment: 'Quick turnaround and carefully packed prints.',
      createdAt: daysAgo(10),
    },
    update: { shopRating: 5, riderRating: 5, comment: 'Quick turnaround and carefully packed prints.' },
  });
}

async function seedSupportAndOperations() {
  await prisma.supportTicket.upsert({
    where: { id: ids.ticket },
    create: {
      id: ids.ticket,
      reference: 'QD-SUP-DEMO1',
      customerId: ids.customer,
      orderId: ids.order1,
      assignedAdminId: ids.admin,
      subject: 'Question about delivery timing',
      status: 'IN_PROGRESS',
      priority: 'NORMAL',
      createdAt: daysAgo(1),
    },
    update: {
      orderId: ids.order1,
      assignedAdminId: ids.admin,
      subject: 'Question about delivery timing',
      status: 'IN_PROGRESS',
      priority: 'NORMAL',
    },
  });

  for (const message of [
    {
      id: '70000000-0000-4000-8000-000000000002',
      senderId: ids.customer,
      body: 'Could you confirm the estimated delivery time for my order?',
      internalNote: false,
      createdAt: daysAgo(1),
    },
    {
      id: '70000000-0000-4000-8000-000000000003',
      senderId: ids.admin,
      body: 'Your order is with a rider and is being delivered.',
      internalNote: false,
      createdAt: daysAgo(0),
    },
  ]) {
    await prisma.supportTicketMessage.upsert({
      where: { id: message.id },
      create: { ...message, ticketId: ids.ticket },
      update: { body: message.body, internalNote: message.internalNote },
    });
  }

  await prisma.attestationJob.upsert({
    where: { id: ids.job },
    create: {
      id: ids.job,
      reference: 'QD-ATT-DEMO01',
      agentId: ids.agentProfile,
      customerId: ids.customer,
      serviceCode: 'degree-attestation',
      status: 'PROCESSING',
      pickupAddress: { line: '12 Galle Road, Colombo 03, Sri Lanka' },
      returnAddress: { line: '12 Galle Road, Colombo 03, Sri Lanka' },
      estimatedReadyAt: daysAgo(-5),
      createdAt: daysAgo(2),
    },
    update: { status: 'PROCESSING', serviceCode: 'degree-attestation' },
  });
  await prisma.custodyEvent.upsert({
    where: { id: '80000000-0000-4000-8000-000000000002' },
    create: {
      id: '80000000-0000-4000-8000-000000000002',
      jobId: ids.job,
      eventType: 'PROCESSING',
      actorId: ids.agent,
      note: 'Documents received and verification is underway.',
      createdAt: daysAgo(1),
    },
    update: { eventType: 'PROCESSING', note: 'Documents received and verification is underway.' },
  });

  for (const [index, userId, title, body] of [
    [1, ids.customer, 'Order update', 'Your order QD-DEMO-1001 has a rider assigned.'],
    [2, ids.agent, 'New attestation job', 'QD-ATT-DEMO01 is ready for processing.'],
  ]) {
    const id = `90000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    await prisma.notification.upsert({
      where: { id },
      create: { id, userId, title, body, createdAt: daysAgo(index) },
      update: { userId, title, body },
    });
  }

  for (const [index, account, amount, status] of [
    [1, { shopId: ids.approvedShop }, 7500, 'PAID'],
    [2, { riderId: ids.rider }, 1250, 'PENDING'],
    [3, { agentId: ids.agentProfile }, 4500, 'PENDING'],
  ]) {
    const reference = `QD-SET-DEMO${index}`;
    await prisma.settlement.upsert({
      where: { idempotencyKey: `demo:${reference}` },
      create: {
        id: `a2000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        ...account,
        amount,
        status,
        reference,
        idempotencyKey: `demo:${reference}`,
        createdAt: daysAgo(index * 3),
        updatedAt: daysAgo(index * 3),
      },
      update: { ...account, amount, status, updatedAt: new Date() },
    });
  }

  await prisma.auditLog.upsert({
    where: { id: 'a3000000-0000-4000-8000-000000000001' },
    create: {
      id: 'a3000000-0000-4000-8000-000000000001',
      actorId: ids.admin,
      action: 'DEMO_DATA_SEEDED',
      entityId: 'quickdoc-demo-fixtures',
      createdAt: daysAgo(1),
    },
    update: { actorId: ids.admin, action: 'DEMO_DATA_SEEDED' },
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seeding is disabled when NODE_ENV=production');
  }
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Set ALLOW_DEMO_SEED=true to confirm you intend to write demo fixtures to this database');
  }
  if (DEMO_PASSWORD.length < 12) {
    throw new Error('DEMO_USER_PASSWORD must be at least 12 characters');
  }

  await seedUsers();
  await seedShops();
  await seedCatalog();
  await seedPartnerProfiles();
  await seedOrders();
  await seedSupportAndOperations();

  process.stdout.write(`Demo records are ready. All demo accounts use: ${DEMO_PASSWORD}\n`);
  for (const account of accounts) {
    process.stdout.write(`  ${account.role.padEnd(10)} ${account.email}\n`);
  }
}

main()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
