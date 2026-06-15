import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Em produção, desativar log de queries para reduzir overhead de I/O.
    // Em dev, ativar para debug.
    log: process.env.NODE_ENV === 'production' ? [] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db