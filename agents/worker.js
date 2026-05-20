import pkg from 'bullmq';
const { Worker } = pkg;
import { redisConnection } from './lib/queue.js';
import { openDb, run, get } from '../database/db.js';
import { scanUrlList } from './scanners/web_scanner.js';
import JobAgentOrchestrator from './job_agent_orchestrator.js';

const worker = new Worker('job-ingestion-queue', async (job) => {
  const { sessionId, item, opts } = job.data;
  console.log(`[Worker] Processing Job ${job.id}: ${item.name || item.url}`);

  const db = openDb();
  const ctx = {
    db,
    run,
    sessionId,
    log: (msg) => console.log(`[Worker][${sessionId.slice(0, 8)}] ${msg}`),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async logScan(entry) {
      await run(
        db,
        `INSERT INTO scan_logs (source_name, source_channel, url_scanned, status, findings_count, details, duration_ms, session_id)
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
  };

  try {
    // 1. Scrape the source
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

    // RETRY LOGIC: If a high-stealth fetch failed due to rate limits or blocks
    // we throw a specific error to trigger BullMQ's automatic retry backoff.
    const lastScan = await get(db, `SELECT status, details FROM scan_logs WHERE session_id = ? ORDER BY scanned_at DESC LIMIT 1`, [sessionId]);
    if (lastScan && (/429|blocked|timeout|fail/i.test(lastScan.details) || lastScan.status.includes('Failed'))) {
        if (opts.fetch_type === 'proxy' || opts.fetch_type === 'stealth') {
            throw new Error(`RETRY_REQUIRED: Ingestion blocked for ${item.url}. Backing off...`);
        }
    }

    // Evaluation is now handled asynchronously via evaluationQueue triggered in scanner/persist

    console.log(`[Worker] Job ${job.id} complete. Findings: ${foundCount}`);
  } catch (e) {
    console.error(`[Worker] Job ${job.id} failed:`, e.message);
    throw e;
  } finally {
    db.close();
  }
}, {
  connection: redisConnection,
  concurrency: 5, // Handle 5 parallel searches per worker instance
});

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
  console.log(`[Worker] Job ${job.id} has failed with ${err.message}`);
});

console.log('🚀 Ingestion Worker started and listening for jobs...');
