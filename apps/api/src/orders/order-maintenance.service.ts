import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateObjectStorageService } from '../storage/private-object-storage.service';
import { AUTO_COMPLETE_AFTER_MS, completeDeliveredOrder, notifyUsers } from './order-lifecycle';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const BATCH_SIZE = 50;

/**
 * Background housekeeping that keeps the marketplace moving without manual work:
 * - completes delivered orders the customer never confirmed, so partners get settled;
 * - removes expired customer PDFs that are not attached to any order.
 *
 * Every step is idempotent and guarded by conditional updates, so running it on several
 * instances at once is safe.
 */
@Injectable()
export class OrderMaintenanceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OrderMaintenanceService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_BACKGROUND_JOBS === 'true') return;
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
    // Run shortly after start-up too; free-tier hosts sleep and may miss scheduled sweeps.
    setTimeout(() => void this.sweep(), 30_000).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const completed = await this.autoCompleteDeliveredOrders();
      const removed = await this.removeExpiredDocuments();
      if (completed || removed) {
        this.logger.log(`Maintenance: completed ${completed} delivered order(s), removed ${removed} expired document(s)`);
      }
    } catch (error) {
      this.logger.error('Maintenance sweep failed', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }

  async autoCompleteDeliveredOrders(now = new Date()): Promise<number> {
    const due = await this.prisma.order.findMany({
      where: { status: 'DELIVERED', updatedAt: { lte: new Date(now.getTime() - AUTO_COMPLETE_AFTER_MS) } },
      select: { id: true, reference: true, customerId: true },
      take: BATCH_SIZE,
    });
    let completed = 0;
    for (const order of due) {
      const done = await this.prisma.$transaction(async (transaction) => {
        // The customer is recorded as the actor because the platform completed it on their behalf.
        const changed = await completeDeliveredOrder(
          transaction,
          order.id,
          order.customerId,
          'Completed automatically 48 hours after confirmed delivery',
        );
        if (changed) {
          await notifyUsers(
            transaction,
            [order.customerId],
            'Order completed',
            `Order ${order.reference} was completed automatically after delivery. Contact support if anything is wrong.`,
          );
        }
        return changed;
      });
      if (done) completed += 1;
    }
    return completed;
  }

  async removeExpiredDocuments(now = new Date()): Promise<number> {
    const expired = await this.prisma.document.findMany({
      where: { expiresAt: { lte: now }, OrderItem: { none: {} } },
      select: { id: true, objectKey: true },
      take: BATCH_SIZE,
    });
    let removed = 0;
    for (const document of expired) {
      try {
        await this.storage.deleteObject(document.objectKey);
        await this.prisma.document.deleteMany({ where: { id: document.id, OrderItem: { none: {} } } });
        removed += 1;
      } catch (error) {
        this.logger.warn(`Could not remove expired document ${document.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    return removed;
  }
}
