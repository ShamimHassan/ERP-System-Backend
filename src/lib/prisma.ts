import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Singleton PrismaClient — shared across all requests in the same process.
 *
 * Vercel serverless: each function invocation gets its own Node.js process.
 * The globalThis pattern ensures we don't create a new PrismaClient on every
 * hot-reload in development, but on Vercel this is always a fresh instance.
 *
 * Optimizations:
 * - Logging disabled in production (was adding ~50–200ms per query)
 * - connection_limit=5 prevents exhausting the Postgres connection pool
 *   on Vercel where many function instances may run simultaneously
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Only log in development — production logging adds latency
    log: process.env.NODE_ENV === 'production' ? [] : ['error', 'warn'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
