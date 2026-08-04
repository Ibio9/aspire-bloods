import type { Store, Options, IncrementResponse } from 'express-rate-limit';
import { prisma } from '../db/client.js';

/**
 * A fixed-window rate-limit store backed by Postgres instead of the
 * express-rate-limit default in-memory Map. The in-memory store silently
 * loses all limiter state on every process restart — on Railway that means
 * every deploy, which is far too frequent a reset for a login/OTP limiter
 * to be a meaningful protection. Each limiter instance gets its own prefix
 * so limiters never collide on the same underlying key (e.g. the same IP
 * hitting both the login and signup limiters).
 */
export class PostgresRateLimitStore implements Store {
  private windowMs = 60_000;
  private readonly keyPrefix: string;

  constructor(prefix: string) {
    this.keyPrefix = prefix;
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private fullKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const fullKey = this.fullKey(key);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.rateLimitHit.findUnique({ where: { key: fullKey } });
      if (!existing || existing.resetAt <= now) {
        return tx.rateLimitHit.upsert({
          where: { key: fullKey },
          create: { key: fullKey, count: 1, resetAt: new Date(now.getTime() + this.windowMs) },
          update: { count: 1, resetAt: new Date(now.getTime() + this.windowMs) },
        });
      }
      return tx.rateLimitHit.update({
        where: { key: fullKey },
        data: { count: { increment: 1 } },
      });
    });

    return { totalHits: result.count, resetTime: result.resetAt };
  }

  async decrement(key: string): Promise<void> {
    const fullKey = this.fullKey(key);
    await prisma.rateLimitHit.updateMany({
      where: { key: fullKey, count: { gt: 0 } },
      data: { count: { decrement: 1 } },
    });
  }

  async resetKey(key: string): Promise<void> {
    await prisma.rateLimitHit.deleteMany({ where: { key: this.fullKey(key) } });
  }
}

/** Deletes expired buckets so the table doesn't grow unbounded. Run periodically from a cron job. */
export async function purgeExpiredRateLimitHits(): Promise<number> {
  const result = await prisma.rateLimitHit.deleteMany({ where: { resetAt: { lt: new Date() } } });
  return result.count;
}
