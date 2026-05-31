import pkg from 'bullmq';
const { Queue } = pkg;
import IORedis from 'ioredis';

/**
 * Redis connection shared by all queues and workers.
 * Configure via REDIS_HOST / REDIS_PORT env vars (see .env.example).
 */
export const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,    // Required by BullMQ
  lazyConnect: false,
});

redisConnection.on('error', (err) => {
  // Log but don't crash — BullMQ handles reconnection internally
  console.error('[Redis] Connection error:', err.message);
});

redisConnection.on('connect', () => {
  console.log('[Redis] Connected');
});

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 100 }, // Keep last 100 completed jobs for debugging
  removeOnFail: { count: 200 },     // Keep last 200 failed jobs for post-mortem
};

export const ingestionQueue = new Queue('job-ingestion-queue', {
  connection: redisConnection,
  defaultJobOptions,
});

export const evaluationQueue = new Queue('agent-evaluation-queue', {
  connection: redisConnection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 2, // Agent loops are expensive — limit retries
  },
});
