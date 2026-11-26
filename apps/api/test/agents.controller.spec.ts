import { AgentsController } from '../src/agents/agents.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AgentsController service catalogue', () => {
  const request = { user: { id: 'agent-user-id', roles: ['AGENT'] } };
  const serviceDto = {
    code: 'Degree-Attestation',
    name: 'Untrusted service label',
    price: 5200,
    estimatedDays: 8,
    enabled: true,
  };

  it('stores agent prices against the canonical platform service', async () => {
    const prisma = {
      agentProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'agent-profile-id' }) },
      platformCatalogService: {
        findFirst: jest.fn().mockResolvedValue({
          code: 'degree-attestation',
          name: 'Degree certificate attestation',
          description: 'Certified attestation',
          enabled: true,
        }),
      },
      agentService: { upsert: jest.fn().mockResolvedValue({ id: 'offer-id' }) },
    };
    const controller = new AgentsController(prisma as unknown as PrismaService);

    await controller.service(request, serviceDto);

    expect(prisma.agentService.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { agentId_code: { agentId: 'agent-profile-id', code: 'degree-attestation' } },
      create: expect.objectContaining({
        agentId: 'agent-profile-id',
        code: 'degree-attestation',
        name: 'Degree certificate attestation',
        price: 5200,
        estimatedDays: 8,
        enabled: true,
        isCustom: false,
        reviewStatus: 'APPROVED',
      }),
      update: expect.objectContaining({
        name: 'Degree certificate attestation',
        price: 5200,
        estimatedDays: 8,
        enabled: true,
        isCustom: false,
      }),
    }));
  });

  it('creates custom services as pending review', async () => {
    const prisma = {
      agentProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'agent-profile-id' }) },
      platformCatalogService: { findFirst: jest.fn().mockResolvedValue(null) },
      agentService: { upsert: jest.fn().mockResolvedValue({ id: 'custom-offer-id' }) },
    };
    const controller = new AgentsController(prisma as unknown as PrismaService);

    await controller.service(request, {
      ...serviceDto,
      code: 'custom-service',
      name: 'Custom service',
      description: 'A provider-defined service',
    });

    expect(prisma.agentService.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        code: 'custom-service',
        name: 'Custom service',
        description: 'A provider-defined service',
        isCustom: true,
        reviewStatus: 'PENDING',
      }),
    }));
  });
});
