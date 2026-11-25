import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const ticketStatuses = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'] as const;
const ticketPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export type TicketStatus = (typeof ticketStatuses)[number];
export type TicketPriority = (typeof ticketPriorities)[number];

export function isTicketStatus(value: string): value is TicketStatus {
  return ticketStatuses.includes(value as TicketStatus);
}

export function isTicketPriority(value: string): value is TicketPriority {
  return ticketPriorities.includes(value as TicketPriority);
}

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async listCustomerTickets(customerId: string) {
    return this.prisma.supportTicket.findMany({
      where: { customerId },
      select: {
        id: true,
        reference: true,
        subject: true,
        status: true,
        priority: true,
        orderId: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          where: { internalNote: false },
          select: { body: true, createdAt: true, senderId: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getCustomerTicket(id: string, customerId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, customerId },
      select: {
        id: true,
        reference: true,
        subject: true,
        status: true,
        priority: true,
        orderId: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          where: { internalNote: false },
          select: {
            id: true,
            body: true,
            createdAt: true,
            senderId: true,
            sender: { select: { name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Support ticket was not found');
    return ticket;
  }

  async createCustomerTicket(customerId: string, input: { subject: string; body: string; orderId?: string }) {
    if (input.orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: input.orderId, customerId },
        select: { id: true },
      });
      if (!order) throw new BadRequestException('The selected order does not belong to this account');
    }

    const ticketId = randomUUID();
    const reference = `QD-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    return this.prisma.$transaction(async (transaction) => {
      const ticket = await transaction.supportTicket.create({
        data: {
          id: ticketId,
          reference,
          customerId,
          orderId: input.orderId,
          subject: input.subject.trim(),
          messages: {
            create: {
              id: randomUUID(),
              senderId: customerId,
              body: input.body.trim(),
            },
          },
        },
        select: { id: true, reference: true, subject: true, status: true, priority: true, orderId: true, createdAt: true, updatedAt: true },
      });
      await transaction.auditLog.create({
        data: { id: randomUUID(), actorId: customerId, action: 'SUPPORT_TICKET_CREATED', entityId: ticketId },
      });
      return ticket;
    });
  }

  async replyAsCustomer(id: string, customerId: string, body: string) {
    const existing = await this.prisma.supportTicket.findFirst({
      where: { id, customerId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Support ticket was not found');

    return this.prisma.$transaction(async (transaction) => {
      await transaction.supportTicketMessage.create({
        data: { id: randomUUID(), ticketId: id, senderId: customerId, body: body.trim() },
      });
      await transaction.supportTicket.update({
        where: { id },
        data: {
          status: 'OPEN',
          resolvedAt: null,
          updatedAt: new Date(),
        },
      });
      return transaction.supportTicket.findFirst({
        where: { id, customerId },
        select: {
          id: true,
          reference: true,
          subject: true,
          status: true,
          priority: true,
          orderId: true,
          createdAt: true,
          updatedAt: true,
          messages: {
            where: { internalNote: false },
            select: {
              id: true,
              body: true,
              createdAt: true,
              senderId: true,
              sender: { select: { name: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    });
  }

  async listAdminTickets(query: { page: number; pageSize: number; search?: string; status?: string }) {
    const search = query.search?.trim();
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: 'insensitive' as const } },
              { subject: { contains: search, mode: 'insensitive' as const } },
              { customer: { name: { contains: search, mode: 'insensitive' as const } } },
              { customer: { email: { contains: search, mode: 'insensitive' as const } } },
              { order: { reference: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        select: {
          id: true,
          reference: true,
          subject: true,
          status: true,
          priority: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { id: true, name: true, email: true } },
          order: { select: { id: true, reference: true } },
          assignedAdmin: { select: { id: true, name: true, email: true } },
          messages: {
            where: { internalNote: false },
            select: { body: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pageCount: Math.ceil(total / query.pageSize),
      },
    };
  }

  async getAdminTicket(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        order: { select: { id: true, reference: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
        messages: {
          include: { sender: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Support ticket was not found');
    return ticket;
  }

  async updateAdminTicket(
    id: string,
    adminId: string,
    input: { status?: TicketStatus; priority?: TicketPriority; assignedAdminId?: string | null },
  ) {
    const existing = await this.prisma.supportTicket.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Support ticket was not found');
    if (input.assignedAdminId) {
      const admin = await this.prisma.user.findFirst({
        where: { id: input.assignedAdminId, UserRole: { some: { role: 'ADMIN' } } },
        select: { id: true },
      });
      if (!admin) throw new BadRequestException('The assigned user is not an administrator');
    }
    return this.prisma.$transaction(async (transaction) => {
      const ticket = await transaction.supportTicket.update({
        where: { id },
        data: {
          status: input.status,
          priority: input.priority,
          assignedAdminId: input.assignedAdminId,
          resolvedAt: input.status === 'RESOLVED' ? new Date() : input.status ? null : undefined,
          updatedAt: new Date(),
        },
        select: { id: true, reference: true, status: true, priority: true, assignedAdminId: true, resolvedAt: true, updatedAt: true },
      });
      const actions = [
        ...(input.status ? [`SUPPORT_TICKET_STATUS_${input.status}`] : []),
        ...(input.priority ? [`SUPPORT_TICKET_PRIORITY_${input.priority}`] : []),
        ...(input.assignedAdminId !== undefined
          ? [input.assignedAdminId ? 'SUPPORT_TICKET_ASSIGNED' : 'SUPPORT_TICKET_UNASSIGNED']
          : []),
      ];
      for (const action of actions) {
        await transaction.auditLog.create({
          data: { id: randomUUID(), actorId: adminId, action, entityId: id },
        });
      }
      return ticket;
    });
  }

  async replyAsAdmin(id: string, adminId: string, body: string, internalNote: boolean) {
    const existing = await this.prisma.supportTicket.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Support ticket was not found');
    return this.prisma.$transaction(async (transaction) => {
      await transaction.supportTicketMessage.create({
        data: { id: randomUUID(), ticketId: id, senderId: adminId, body: body.trim(), internalNote },
      });
      const ticket = await transaction.supportTicket.update({
        where: { id },
        data: {
          status: internalNote ? undefined : 'WAITING_FOR_CUSTOMER',
          resolvedAt: internalNote ? undefined : null,
          updatedAt: new Date(),
        },
        select: { id: true, reference: true, status: true, priority: true, updatedAt: true },
      });
      await transaction.auditLog.create({
        data: {
          id: randomUUID(),
          actorId: adminId,
          action: internalNote ? 'SUPPORT_INTERNAL_NOTE_ADDED' : 'SUPPORT_REPLY_SENT',
          entityId: id,
        },
      });
      return ticket;
    });
  }
}
