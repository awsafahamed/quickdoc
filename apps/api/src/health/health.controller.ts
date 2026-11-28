import { Controller, Get } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { PrivateObjectStorageService } from '../storage/private-object-storage.service';
import { PrismaService } from '../prisma/prisma.service';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

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

  /** Writes, reads and deletes a tiny private object to prove document storage works. */
  @Get('storage')
  @SkipThrottle({ default: false })
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  getStorageHealth() {
    return this.storage.checkHealth();
  }
}
