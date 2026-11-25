const bcrypt = require('bcryptjs');
const path = require('path');
const { Prisma, PrismaClient } = require('@prisma/client');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_CREATE_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_CREATE_NAME?.trim();
  const password = process.env.ADMIN_CREATE_PASSWORD;

  if (!email || !name || !password) {
    throw new Error('Set ADMIN_CREATE_EMAIL, ADMIN_CREATE_NAME, and ADMIN_CREATE_PASSWORD');
  }
  if (password.length < 16) {
    throw new Error('ADMIN_CREATE_PASSWORD must be at least 16 characters');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.$transaction(async (transaction) => {
    const existingUser = await transaction.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error('That email already belongs to an account; no role or password was changed');
    }

    return transaction.user.create({
      data: {
        email,
        name,
        passwordHash,
        UserRole: { create: { role: 'ADMIN' } },
      },
      select: { email: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  process.stdout.write(`Created administrator account: ${admin.email}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    delete process.env.ADMIN_CREATE_EMAIL;
    delete process.env.ADMIN_CREATE_NAME;
    delete process.env.ADMIN_CREATE_PASSWORD;
    await prisma.$disconnect();
  });
