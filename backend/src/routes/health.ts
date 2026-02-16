import { Router } from 'express';
import { prisma } from '../config/database';
import { redis } from '../config/redis';

const router = Router();

const APP_VERSION = '1.0.0';
const CHECK_TIMEOUT_MS = 3_000;
const startTime = Date.now();

type CheckStatus = 'up' | 'down';

interface DependencyCheck {
  status: CheckStatus;
  latency_ms: number;
  error?: string;
}

interface MemoryCheck {
  rss_mb: number;
  heap_used_mb: number;
  heap_total_mb: number;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: DependencyCheck;
    redis: DependencyCheck;
    memory: MemoryCheck;
  };
}

/**
 * Run an async check with a timeout. Returns the check result or a
 * "down" result if the check exceeds the timeout or throws.
 */
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Check timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function checkDatabase(): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    await withTimeout(
      () => prisma.$queryRaw`SELECT 1` as Promise<unknown>,
      CHECK_TIMEOUT_MS,
    );
    return { status: 'up', latency_ms: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { status: 'down', latency_ms: Date.now() - start, error: message };
  }
}

async function checkRedis(): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    await withTimeout(() => redis.ping(), CHECK_TIMEOUT_MS);
    return { status: 'up', latency_ms: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { status: 'down', latency_ms: Date.now() - start, error: message };
  }
}

function checkMemory(): MemoryCheck {
  const mem = process.memoryUsage();
  return {
    rss_mb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
    heap_used_mb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
    heap_total_mb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
  };
}

function deriveStatus(
  db: DependencyCheck,
  redisCheck: DependencyCheck,
): 'healthy' | 'degraded' | 'unhealthy' {
  const dbUp = db.status === 'up';
  const redisUp = redisCheck.status === 'up';

  if (dbUp && redisUp) return 'healthy';
  if (!dbUp && !redisUp) return 'unhealthy';
  return 'degraded';
}

/**
 * GET /health
 *
 * Comprehensive health check that verifies database and Redis connectivity.
 * Returns 200 for healthy/degraded, 503 for unhealthy.
 */
router.get('/', async (_req, res) => {
  const [database, redisCheck] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const status = deriveStatus(database, redisCheck);
  const uptimeSeconds = Math.round((Date.now() - startTime) / 1000);

  const body: HealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    uptime: uptimeSeconds,
    checks: {
      database,
      redis: redisCheck,
      memory: checkMemory(),
    },
  };

  const httpStatus = status === 'unhealthy' ? 503 : 200;
  res.status(httpStatus).json(body);
});

/**
 * GET /health/ready
 *
 * Readiness probe: returns 200 only when ALL dependencies are reachable.
 * Suitable for Kubernetes readiness probes and load balancer health checks
 * that should only route traffic to fully ready instances.
 */
router.get('/ready', async (_req, res) => {
  const [database, redisCheck] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const allUp = database.status === 'up' && redisCheck.status === 'up';

  if (allUp) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: database.status, latency_ms: database.latency_ms },
        redis: { status: redisCheck.status, latency_ms: redisCheck.latency_ms },
      },
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database,
        redis: redisCheck,
      },
    });
  }
});

export default router;
