const bcrypt = require('bcryptjs');
const path = require('path');
const { Prisma, PrismaClient } = require('@prisma/client');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();
const variableNames = [
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_NAME',
  'BOOTSTRAP_ADMIN_PASSWORD',
];

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const configuredCount = [email, name, password].filter(Boolean).length;

  if (configuredCount === 0) {
    process.stdout.write('Admin bootstrap skipped: no bootstrap variables configured\n');
    return;
  }
  if (configuredCount !== variableNames.length) {
    throw new Error('Set all BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, and BOOTSTRAP_ADMIN_PASSWORD variables');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
  }
  if (password.length < 16) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 16 characters');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await prisma.$transaction(async (transaction) => {
    const existingAdmin = await transaction.userRole.count({ where: { role: 'ADMIN' } });
    if (existingAdmin > 0) {
      return { created: false };
    }

    const existingUser = await transaction.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error('The bootstrap email already belongs to an account');
    }

    const user = await transaction.user.create({
      data: { email, name, passwordHash },
      select: { id: true, email: true },
    });
    await transaction.userRole.create({ data: { userId: user.id, role: 'ADMIN' } });
    return { created: true, email: user.email };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result.created) {
    process.stdout.write(`Created the first administrator account: ${result.email}\n`);
  } else {
    process.stdout.write('Admin bootstrap skipped: an administrator already exists\n');
  }
}

main()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const name of variableNames) {
      delete process.env[name];
    }
    await prisma.$disconnect();
  });
