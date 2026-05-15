import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { openDb, run, all } from '../database/db.js';
import { scanUrlList } from './scanners/web_scanner.js';
import { scanDuckDuckGo } from './scanners/duckduckgo_scanner.js';
import { scanSocialChannels } from './scanners/social_scanner.js';

const sourcesPath = path.resolve('./agents/sources.json');

export async function runDeepScan() {
  const sessionId = crypto.randomUUID();
  const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
  const db = openDb();
  let totalFound = 0;
  let sourcesChecked = 0;

  await run(
    db,
    `INSERT INTO scan_sessions (id, status) VALUES (?, 'running')`,
    [sessionId]
  );

  const ctx = {
    db,
    run,
    sessionId,
    log(msg) {
      console.log(`[Scan ${sessionId.slice(0, 8)}] ${msg}`);
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async logScan(entry) {
      sourcesChecked++;
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

  ctx.log('=== Deep scan started ===');

  totalFound += await scanUrlList(ctx, sources.career_portals, {
    channel: 'internal_careers',
    source_type: 'direct_job',
  });
  totalFound += await scanUrlList(ctx, sources.hiring_boards, {
    channel: 'hiring_site',
    source_type: 'direct_job',
  });
  totalFound += await scanUrlList(ctx, sources.tenders_and_signals, {
    channel: 'tender',
    source_type: 'hidden_signal',
    offbeat: true,
  });
  totalFound += await scanSocialChannels(ctx, sources);
  totalFound += await scanDuckDuckGo(ctx, sources.duckduckgo_queries || []);

  const oppCount = await all(db, `SELECT COUNT(*) as c FROM opportunities`);
  const count = oppCount[0]?.c || 0;

  await run(
    db,
    `UPDATE scan_sessions SET status='complete', finished_at=datetime('now'), sources_checked=?, roles_found=? WHERE id=?`,
    [sourcesChecked, count, sessionId]
  );

  db.close();
  ctx.log(`=== Done: ${count} opportunities in DB, session ${sessionId} ===`);

  return {
    sessionId,
    sourcesChecked,
    opportunitiesInDb: count,
    newSignalsThisRun: totalFound,
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
