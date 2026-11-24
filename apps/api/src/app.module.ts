import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrintModule } from './print/print.module';
import { AttestationModule } from './attestation/attestation.module';
import { ShopsModule } from './shops/shops.module';
import { RidersModule } from './riders/riders.module';
import { AdminModule } from './admin/admin.module';
import { AgentsModule } from './agents/agents.module';
import { CustomerModule } from './customer/customer.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, HealthModule, PrintModule, AttestationModule, ShopsModule, RidersModule, AdminModule, AgentsModule, CustomerModule],
})
export class AppModule {}
