import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { openDb, run, all } from '../database/db.js';
import { ingestionQueue } from './lib/queue.js';

const sourcesPath = path.resolve('./agents/sources.json');

/**
 * Distributed Queue Orchestrator
 */
export async function runDeepScan() {
  const sessionId = crypto.randomUUID();
  const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
  const db = openDb();
  let jobsDispatched = 0;

  await run(
    db,
    `INSERT INTO scan_sessions (id, status) VALUES (?, 'running')`,
    [sessionId]
  );

  console.log(`[Orchestrator ${sessionId.slice(0, 8)}] Dispatching tracking jobs to Redis...`);

  const dispatch = async (items, opts) => {
    for (const item of items) {
      await ingestionQueue.add('scrape-source', {
        sessionId,
        item,
        opts
      });
      jobsDispatched++;
    }
  };

  // TRACK A Dispatch (Direct Portals & Hiring Boards)
  await dispatch(sources.career_portals, {
    track: 'A',
    channel: 'internal_careers',
    source_type: 'direct_job',
    fetch_type: 'basic'
  });

  await dispatch(sources.hiring_boards, {
    track: 'A',
    channel: 'hiring_site',
    source_type: 'direct_job',
    fetch_type: 'basic'
  });

  await dispatch(sources.tenders_and_signals, {
    track: 'A',
    channel: 'tender',
    source_type: 'hidden_signal',
    offbeat: true,
    fetch_type: 'basic'
  });

  // TRACK B Dispatch (Social, Search Queries, Specialized)
  const queries = sources.duckduckgo_queries || [];
  for (const q of queries) {
      await ingestionQueue.add('scrape-source', {
          sessionId,
          item: { name: `Query: ${q.slice(0, 30)}`, url: q },
          opts: { track: 'B', channel: 'duckduckgo', fetch_type: 'stealth' }
      });
      jobsDispatched++;
  }

  if (sources.linkedin?.search_urls) {
    for (const url of sources.linkedin.search_urls) {
        await ingestionQueue.add('scrape-source', {
            sessionId,
            item: { name: 'LinkedIn Search', url },
            opts: { track: 'B', channel: 'linkedin', fetch_type: 'stealth' }
        });
        jobsDispatched++;
    }
  }

  console.log(`[Orchestrator] Successfully dispatched ${jobsDispatched} jobs to BullMQ.`);

  db.close();
  return {
    sessionId,
    jobsDispatched
  };
}

if (process.argv[1]?.endsWith('orchestrator.js')) {
  runDeepScan()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
