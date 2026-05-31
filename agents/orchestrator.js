import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { openDb, run, all } from '../database/db.js';
import { ingestionQueue } from './lib/queue.js';

// Resolve sources.json relative to this file, not the CWD
const _dir = path.dirname(fileURLToPath(import.meta.url));
const sourcesPath = path.resolve(_dir, 'sources.json');

let _sources;
try {
  _sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
} catch (e) {
  throw new Error(`[Orchestrator] Failed to load sources.json: ${e.message}`);
}

/**
 * Distributed Queue Orchestrator
 */
export async function runDeepScan() {
  const sessionId = crypto.randomUUID();
  const sources = _sources;
  const db = openDb();
  let jobsDispatched = 0;

  try {
    await run(
      db,
      `INSERT INTO scan_sessions (id, status) VALUES (?, 'running')`,
      [sessionId]
    );

    console.log(`[Orchestrator ${sessionId.slice(0, 8)}] Dispatching tracking jobs to Redis…`);

    const dispatch = async (items, opts) => {
      for (const item of items) {
        await ingestionQueue.add('scrape-source', { sessionId, item, opts });
        jobsDispatched++;
      }
    };

    // TRACK A — Direct portals, hiring boards, tenders
    await dispatch(sources.career_portals || [], {
      track: 'A', channel: 'internal_careers', source_type: 'direct_job', fetch_type: 'basic',
    });
    await dispatch(sources.hiring_boards || [], {
      track: 'A', channel: 'hiring_site', source_type: 'direct_job', fetch_type: 'basic',
    });
    await dispatch(sources.tenders_and_signals || [], {
      track: 'A', channel: 'tender', source_type: 'hidden_signal', offbeat: true, fetch_type: 'basic',
    });

    // TRACK B — Social, search queries, specialised
    for (const q of (sources.duckduckgo_queries || [])) {
      await ingestionQueue.add('scrape-source', {
        sessionId,
        item: { name: `Query: ${q.slice(0, 30)}`, url: q },
        opts: { track: 'B', channel: 'duckduckgo', fetch_type: 'stealth' },
      });
      jobsDispatched++;
    }

    for (const url of (sources.linkedin?.search_urls || [])) {
      await ingestionQueue.add('scrape-source', {
        sessionId,
        item: { name: 'LinkedIn Search', url },
        opts: { track: 'B', channel: 'linkedin', fetch_type: 'stealth' },
      });
      jobsDispatched++;
    }

    // TRACK C — Platform V2 (CutShort, IIMJobs, TenderTiger, Industry News, GitHub Hiring, Founder Mode)
    await dispatch(sources.platform_v2_sources || [], {
        track: 'C', channel: 'platform_v2', fetch_type: 'basic', evaluate: true
    });

    console.log(`[Orchestrator] Dispatched ${jobsDispatched} jobs to BullMQ`);
    return { sessionId, jobsDispatched };
  } finally {
    db.close();
  }
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
