import pkg from 'bullmq';
const { Worker } = pkg;
import { redisConnection, evaluationQueue } from './lib/queue.js';
import { openDb, run, get } from '../database/db.js';
import { scanUrlList } from './scanners/web_scanner.js';
import SessionVault from './lib/session_vault.js';
import logger from '../api/utils/logger.js';

/**
 * Ingestion Worker
 *
 * Consumes `job-ingestion-queue` jobs dispatched by the orchestrator.
 * Responsibility: raw scraping only — writes rows with status='Raw Ingested'
 * and score=NULL, then enqueues them for async agent evaluation.
 */
const worker = new Worker('job-ingestion-queue', async (job) => {
  const { sessionId, item, opts } = job.data;
  console.log(`[Worker] Job ${job.id}: ${item.name || item.url}`);

  const db = openDb();
  const ctx = {
    db,
    run,
    sessionId,
    log: (msg) => console.log(`[Worker][${sessionId?.slice(0, 8)}] ${msg}`),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async logScan(entry) {
      await run(
        db,
        `INSERT INTO scan_logs
           (source_name, source_channel, url_scanned, status, findings_count, details, duration_ms, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.source_name,
          entry.source_channel,
          entry.url_scanned,
          entry.status,
          entry.findings_count,
          entry.details,
          entry.duration_ms || 0,
          sessionId,
        ]
      );
    },
    /**
     * After a row is persisted, enqueue it for agent evaluation.
     * This is the bridge between the ingestion and evaluation pipelines.
     */
    async enqueueForEvaluation(opportunityId) {
      await evaluationQueue.add('evaluate-opportunity', {
        id: opportunityId,
        sessionId,
      });
    },
  };

  try {
    // Rotate session token for authenticated platforms
    if (opts.channel === 'linkedin' || opts.channel === 'indeed') {
      const sessionToken = SessionVault.getNextSession(opts.channel);
      if (sessionToken) opts.session_token = sessionToken;
    }

    // Dispatch to the correct scanner
    let foundCount = 0;
    if (opts.channel === 'duckduckgo') {
      const { scanDuckDuckGo } = await import('./scanners/duckduckgo_scanner.js');
      foundCount = await scanDuckDuckGo(ctx, [item.url]);
    } else if (opts.channel === 'remoteok') {
      const { scanRemoteOK } = await import('./scanners/platform_scanner.js');
      foundCount = await scanRemoteOK(ctx);
    } else {
      foundCount = await scanUrlList(ctx, [item], opts);
    }

    // Retry trigger: check the last scan log for this session for hard failure signals.
    // We check the status field (not the details text) to avoid false positives.
    const lastScan = await get(
      db,
      `SELECT status FROM scan_logs WHERE session_id = ? ORDER BY scanned_at DESC LIMIT 1`,
      [sessionId]
    );
    if (lastScan && /^Failed$/i.test(lastScan.status)) {
      if (opts.fetch_type === 'proxy' || opts.fetch_type === 'stealth') {
        const retryErr = new Error(`RETRY_REQUIRED: Ingestion blocked for ${item.url}. Backing off…`);
        logger.warn('INGESTION_WORKER', 'Scan blocked — triggering BullMQ retry backoff', {
          source_target:  item.url,
          beyond_remarks: `channel=${opts.channel} fetch_type=${opts.fetch_type} | job will be retried with exponential backoff`,
        });
        throw retryErr;
      }
    }

    logger.info('INGESTION_WORKER', `Job ${job.id} complete`, {
      source_target:  item.url,
      beyond_remarks: `findings=${foundCount} channel=${opts.channel}`,
    });
  } catch (e) {
    logger.error('INGESTION_WORKER', `Job ${job.id} failed: ${e.message}`, {
      source_target:  item.url || item.name,
      stack_trace:    e.stack,
      beyond_remarks: `sessionId=${sessionId?.slice(0, 8)} channel=${opts?.channel} attempt=${job.attemptsMade}`,
    });
    throw e; // Re-throw so BullMQ applies retry/backoff
  } finally {
    db.close();
  }
}, {
  connection: redisConnection,
  concurrency: 5,
});

worker.on('completed', (job) => {
  logger.info('INGESTION_WORKER', `Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  const isDlq = job?.attemptsMade >= 3;
  logger.error('INGESTION_WORKER', `Job ${job?.id} failed${isDlq ? ' — dead-lettered' : ''}`, {
    source_target:  job?.data?.item?.url || job?.data?.item?.name,
    stack_trace:    err.stack,
    beyond_remarks: `attempt=${job?.attemptsMade}${isDlq ? ' | DLQ: target may be permanently blocked — manual review required' : ' | BullMQ will retry'}`,
  });
});

logger.info('INGESTION_WORKER', 'Ingestion Worker started', {
  beyond_remarks: 'listening on job-ingestion-queue | concurrency=5',
});
