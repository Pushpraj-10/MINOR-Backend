import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  // in dev you can enable query logging; disable in production
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
});

export default prisma;