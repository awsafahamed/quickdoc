import type { Order, OrderStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { decryptHandoverCode } from './handover-codes';

type Tx = Prisma.TransactionClient;

/** Platform commission on the shop's print subtotal. */
export const SHOP_COMMISSION_RATE = 0.1;
/** Delivered orders the customer has not confirmed are completed automatically after this. */
export const AUTO_COMPLETE_AFTER_MS = 48 * 60 * 60 * 1000;

/** Orders a shop has not accepted within this window are cancelled so customers are not left waiting. */
export function acceptanceTimeoutMs(): number {
  const hours = Number(process.env.SHOP_ACCEPTANCE_TIMEOUT_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60 * 1000;
}

const money = (value: number) => Math.round(value * 100) / 100;

export function orderReference(prefix = 'PR'): string {
  return `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

export async function notifyUsers(
  tx: Tx,
  userIds: (string | null | undefined)[],
  title: string,
  body: string,
): Promise<void> {
  const recipients = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!recipients.length) return;
  const createdAt = new Date();
  await tx.notification.createMany({
    data: recipients.map((userId) => ({ id: randomUUID(), userId, title, body, createdAt })),
  });
}

const customerStatusMessages: Partial<Record<OrderStatus, (reference: string, reason?: string) => { title: string; body: string }>> = {
  ACCEPTED: (reference) => ({ title: 'Order accepted', body: `The shop accepted order ${reference} and will start printing soon.` }),
  REJECTED: (reference, reason) => ({ title: 'Order declined', body: `The shop could not take order ${reference}${reason ? `: ${reason}` : '.'} You have not been charged.` }),
  PRINTING: (reference) => ({ title: 'Printing started', body: `Order ${reference} is being printed.` }),
  READY_FOR_PICKUP: (reference) => ({ title: 'Ready for delivery', body: `Order ${reference} is printed and waiting for a rider.` }),
  CANCELLED: (reference, reason) => ({ title: 'Order cancelled', body: `Order ${reference} was cancelled${reason ? `: ${reason}` : '.'} You have not been charged.` }),
  COMPLETED: (reference) => ({ title: 'Order completed', body: `Order ${reference} is complete. Thank you for using QuickDoc.` }),
};

export async function notifyCustomerOfStatus(
  tx: Tx,
  order: Pick<Order, 'customerId' | 'reference'>,
  status: OrderStatus,
  reason?: string,
): Promise<void> {
  const message = customerStatusMessages[status]?.(order.reference, reason?.trim() || undefined);
  if (message) await notifyUsers(tx, [order.customerId], message.title, message.body);
}

/** Cash-on-delivery payment record created alongside each order. */
export function initialPayment(orderId: string, total: number) {
  return {
    id: randomUUID(),
    orderId,
    method: 'CASH_ON_DELIVERY' as const,
    status: 'PENDING' as const,
    amount: total,
    idempotencyKey: `order:${orderId}`,
    updatedAt: new Date(),
  };
}

/** Rider confirmed delivery with the customer's PIN, so the cash has been collected. */
export async function markCashCollected(tx: Tx, orderId: string): Promise<void> {
  await tx.payment.updateMany({
    where: { orderId, method: 'CASH_ON_DELIVERY', status: 'PENDING' },
    data: { status: 'PAID', updatedAt: new Date() },
  });
}

/** An order that will not be fulfilled never collects its cash-on-delivery payment. */
export async function voidPendingPayment(tx: Tx, orderId: string): Promise<void> {
  await tx.payment.updateMany({
    where: { orderId, status: 'PENDING' },
    data: { status: 'FAILED', updatedAt: new Date() },
  });
}

/**
 * Records ledger entries and partner settlements for a completed order.
 * Idempotent: every row has a deterministic unique key, so re-running is harmless.
 */
export async function settleCompletedOrder(tx: Tx, orderId: string): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { DeliveryAssignment: true, Payment: true },
  });
  if (!order || order.status !== 'COMPLETED') return;

  const total = Number(order.total);
  const printSubtotal = Number(order.printSubtotal);
  const commission = Number(order.commission);
  const shopPayable = money(printSubtotal - commission);
  const riderPayable = money(Number(order.DeliveryAssignment?.earnings ?? 0));
  const platformRevenue = money(total - shopPayable - riderPayable);
  const cashCollectedByRider = order.Payment?.method === 'CASH_ON_DELIVERY' && order.DeliveryAssignment;

  const ledger = [
    { account: 'CUSTOMER_PAYMENT', amount: total },
    { account: 'SHOP_PAYABLE', amount: shopPayable },
    { account: 'PLATFORM_REVENUE', amount: platformRevenue },
    ...(riderPayable ? [{ account: 'RIDER_PAYABLE', amount: riderPayable }] : []),
  ];
  await tx.financialLedgerEntry.createMany({
    data: ledger.map((entry) => ({
      id: randomUUID(),
      orderId: order.id,
      account: entry.account,
      amount: entry.amount,
      currency: order.currency,
      eventKey: `order:${order.id}:${entry.account}`,
    })),
    skipDuplicates: true,
  });

  const now = new Date();
  const settlements: Prisma.SettlementCreateManyInput[] = [{
    id: randomUUID(),
    shopId: order.shopId,
    orderId: order.id,
    kind: 'PAYOUT',
    amount: shopPayable,
    idempotencyKey: `order:${order.id}:shop-payout`,
    note: `Print earnings for ${order.reference}`,
    updatedAt: now,
  }];
  if (order.DeliveryAssignment && riderPayable > 0) {
    settlements.push({
      id: randomUUID(),
      riderId: order.DeliveryAssignment.riderId,
      orderId: order.id,
      kind: 'PAYOUT',
      amount: riderPayable,
      idempotencyKey: `order:${order.id}:rider-payout`,
      note: `Delivery earnings for ${order.reference}`,
      updatedAt: now,
    });
  }
  if (cashCollectedByRider) {
    settlements.push({
      id: randomUUID(),
      riderId: order.DeliveryAssignment!.riderId,
      orderId: order.id,
      kind: 'CASH_REMITTANCE',
      amount: total,
      idempotencyKey: `order:${order.id}:rider-cash`,
      note: `Cash collected on delivery for ${order.reference}`,
      updatedAt: now,
    });
  }
  await tx.settlement.createMany({ data: settlements, skipDuplicates: true });
}

/** Moves a delivered order to COMPLETED exactly once and settles it. */
export async function completeDeliveredOrder(
  tx: Tx,
  orderId: string,
  actorId: string,
  reason: string,
): Promise<boolean> {
  const updated = await tx.order.updateMany({
    where: { id: orderId, status: 'DELIVERED' },
    data: { status: 'COMPLETED' },
  });
  if (updated.count !== 1) return false;
  await tx.orderStatusHistory.create({
    data: { id: randomUUID(), orderId, status: 'COMPLETED', actorId, reason },
  });
  // Delivery is only confirmed with the customer's PIN, so the cash has been collected.
  await markCashCollected(tx, orderId);
  await settleCompletedOrder(tx, orderId);
  return true;
}

/** Applies money side effects after an administrator overrides an order status. */
export async function applyAdminStatusSideEffects(tx: Tx, orderId: string, status: OrderStatus): Promise<void> {
  if (status === 'DELIVERED' || status === 'COMPLETED') await markCashCollected(tx, orderId);
  if (status === 'COMPLETED') await settleCompletedOrder(tx, orderId);
  if (status === 'CANCELLED' || status === 'REJECTED') {
    await voidPendingPayment(tx, orderId);
    await tx.deliveryOffer.updateMany({
      where: { orderId, status: 'PENDING' },
      data: { status: 'EXPIRED', updatedAt: new Date() },
    });
  }
}

const SECRET_ORDER_FIELDS = [
  'deliveryPinHash',
  'pickupCodeHash',
  'deliveryPinEncrypted',
  'pickupCodeEncrypted',
  'pinAttempts',
  'checkoutFingerprint',
] as const;

const DELIVERY_PIN_VISIBLE: OrderStatus[] = [
  'PENDING_ACCEPTANCE', 'ACCEPTED', 'PRINTING', 'READY_FOR_PICKUP', 'RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY',
];
const PICKUP_CODE_VISIBLE: OrderStatus[] = ['PRINTING', 'READY_FOR_PICKUP', 'RIDER_ASSIGNED'];

/**
 * Removes code hashes and ciphertexts from an order before it leaves the API.
 * The customer sees their delivery PIN while delivery is outstanding; the shop sees the
 * pickup code while a rider may still collect. Riders never receive either code.
 */
export function serializeOrder<T extends Record<string, unknown>>(order: T, audience: 'customer' | 'shop' | 'other') {
  const result: Record<string, unknown> = { ...order };
  const status = order.status as OrderStatus | undefined;
  const locked = typeof order.pinAttempts === 'number' && order.pinAttempts >= 5;
  if (audience === 'customer') {
    result.deliveryPin = status && DELIVERY_PIN_VISIBLE.includes(status)
      ? decryptHandoverCode(order.deliveryPinEncrypted as string | null)
      : null;
    result.handoverLocked = locked && status === 'OUT_FOR_DELIVERY';
  }
  if (audience === 'shop') {
    result.pickupCode = status && PICKUP_CODE_VISIBLE.includes(status)
      ? decryptHandoverCode(order.pickupCodeEncrypted as string | null)
      : null;
    result.handoverLocked = locked && status === 'RIDER_ASSIGNED';
  }
  for (const field of SECRET_ORDER_FIELDS) delete result[field];
  return result as Omit<T, (typeof SECRET_ORDER_FIELDS)[number]> & { deliveryPin?: string | null; pickupCode?: string | null; handoverLocked?: boolean };
}
