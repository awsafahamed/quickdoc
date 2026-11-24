import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

class AgentRegisterDto {
  @IsUUID()
  userId!: string;

  @IsString()
  businessName!: string;

  @IsString()
  address!: string;

  @IsString()
  phone!: string;
}

class AgentServiceDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  estimatedDays!: number;

  @IsBoolean()
  enabled!: boolean;
}

@Controller('agents')
export class AgentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('register')
  async register(@Body() dto: AgentRegisterDto) {
    const existing = await this.prisma.agentProfile.findUnique({ where: { userId: dto.userId } });
    if (existing) return { data: existing };
    return { data: await this.prisma.agentProfile.create({ data: { userId: dto.userId, businessName: dto.businessName, address: dto.address, phone: dto.phone } }) };
  }

  @Get(':agentId/jobs')
  async jobs(@Param('agentId') agentId: string) {
    return { data: await this.prisma.attestationJob.findMany({ where: { agentId }, include: { custodyEvents: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' } }) };
  }

  @Post(':agentId/jobs/:jobId/custody')
  async custody(@Param('agentId') agentId: string, @Param('jobId') jobId: string, @Body() body: { eventType: 'RECEIVED' | 'PROCESSING' | 'ATTESTED' | 'RETURN_READY'; note?: string; evidenceUrl?: string }) {
    const job = await this.prisma.attestationJob.findFirst({ where: { id: jobId, agentId } });
    if (!job) return { error: 'Attestation job was not found for this agent' };
    const statusMap = { RECEIVED: 'AGENT_RECEIVED', PROCESSING: 'PROCESSING', ATTESTED: 'ATTESTED', RETURN_READY: 'RETURN_READY' } as const;
    const event = await this.prisma.custodyEvent.create({ data: { id: randomUUID(), jobId, eventType: body.eventType, actorId: agentId, evidenceUrl: body.evidenceUrl, note: body.note } });
    await this.prisma.attestationJob.update({ where: { id: jobId }, data: { status: statusMap[body.eventType] } });
    return { data: event };
  }

  @Post(':agentId/services')
  async service(@Param('agentId') agentId: string, @Body() dto: AgentServiceDto) {
    return { data: await this.prisma.agentService.upsert({ where: { agentId_code: { agentId, code: dto.code } }, create: { agentId, code: dto.code, name: dto.name, price: dto.price, estimatedDays: dto.estimatedDays, enabled: dto.enabled }, update: { name: dto.name, price: dto.price, estimatedDays: dto.estimatedDays, enabled: dto.enabled } }) };
  }

  @Get(':agentId/services')
  async services(@Param('agentId') agentId: string) {
    return { data: await this.prisma.agentService.findMany({ where: { agentId }, orderBy: { name: 'asc' } }) };
  }
}
