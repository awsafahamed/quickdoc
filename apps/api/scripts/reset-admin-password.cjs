const bcrypt = require('bcryptjs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_RESET_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_RESET_PASSWORD;

  if (!email || !password) {
    throw new Error('Set ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD');
  }
  if (password.length < 16) {
    throw new Error('ADMIN_RESET_PASSWORD must be at least 16 characters');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { email },
      include: { UserRole: true },
    });

    if (!user || !user.UserRole.some((role) => role.role === 'ADMIN')) {
      const admins = await transaction.userRole.findMany({
        where: { role: 'ADMIN' },
        select: { User: { select: { email: true } } },
      });
      const emails = admins.map((admin) => admin.User.email);
      if (emails.length === 0) {
        throw new Error('No administrator accounts exist in this database; verify DATABASE_URL');
      }
      throw new Error(`That email is not an administrator. Existing administrator emails: ${emails.join(', ')}`);
    }
    if (user.suspended) {
      throw new Error('The administrator account is suspended; password reset refused');
    }

    await transaction.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await transaction.refreshSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return user.email;
  });

  process.stdout.write(`Updated the password for administrator account: ${admin}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    delete process.env.ADMIN_RESET_EMAIL;
    delete process.env.ADMIN_RESET_PASSWORD;
    await prisma.$disconnect();
  });
