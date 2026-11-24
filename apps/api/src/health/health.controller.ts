import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth(): { status: 'ok'; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'print-attest-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('database')
  async getDatabaseHealth(): Promise<{ status: 'ok'; service: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'postgresql' };
  }
}
