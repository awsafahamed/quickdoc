import { ForbiddenException } from '@nestjs/common';
import { CustomerSupportController } from '../src/support/support.controller';
import { SupportService } from '../src/support/support.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('SupportService', () => {
  it('keeps internal notes out of customer ticket details', async () => {
    const ticket = {
      id: 'ticket-id',
      messages: [{ id: 'public-message', body: 'We are checking this for you.' }],
    };
    const prisma = {
      supportTicket: { findFirst: jest.fn().mockResolvedValue(ticket) },
    } as unknown as PrismaService;
    const service = new SupportService(prisma);

    await expect(service.getCustomerTicket('ticket-id', 'customer-id')).resolves.toEqual(ticket);
    expect(prisma.supportTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ticket-id', customerId: 'customer-id' },
      select: expect.objectContaining({
        messages: expect.objectContaining({ where: { internalNote: false } }),
      }),
    }));
  });

  it('reopens a resolved ticket when its customer replies', async () => {
    const result = {
      id: 'ticket-id',
      status: 'OPEN',
      messages: [{ id: 'new-message', body: 'It is still happening.' }],
    };
    const transaction = {
      supportTicketMessage: { create: jest.fn() },
      supportTicket: {
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(result),
      },
    };
    const prisma = {
      supportTicket: { findFirst: jest.fn().mockResolvedValue({ id: 'ticket-id', status: 'RESOLVED' }) },
      $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaService;
    const service = new SupportService(prisma);

    await expect(service.replyAsCustomer('ticket-id', 'customer-id', ' It is still happening. ')).resolves.toEqual(result);
    expect(transaction.supportTicket.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ticket-id' },
      data: expect.objectContaining({ status: 'OPEN', resolvedAt: null }),
    }));
  });

  it('requires a customer role before returning ticket data', async () => {
    const support = { listCustomerTickets: jest.fn() } as unknown as SupportService;
    const controller = new CustomerSupportController(support);

    expect(() => controller.list({ user: { id: 'rider-id', roles: ['RIDER'] } })).toThrow(ForbiddenException);
    expect(support.listCustomerTickets).not.toHaveBeenCalled();
  });
});
