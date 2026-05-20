import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { openDb, run, all } from '../database/db.js';
import { scanUrlList } from './scanners/web_scanner.js';
import { scanDuckDuckGo } from './scanners/duckduckgo_scanner.js';
import { scanSocialChannels } from './scanners/social_scanner.js';
import { scanSpecializedPlatforms } from './scanners/platform_scanner.js';
import JobAgentOrchestrator from './job_agent_orchestrator.js';

const sourcesPath = path.resolve('./agents/sources.json');

/**
 * Dual-Track Orchestrator
 */
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

  ctx.log('=== Dual-Track Scan Started ===');

  // TRACK A: The Reliable Anchor (Core Renewables & Site Roles)
  ctx.log('--- TRACK A: Reliable Anchor ---');
  totalFound += await scanUrlList(ctx, sources.career_portals, {
    channel: 'internal_careers',
    source_type: 'direct_job',
    fetch_type: 'basic'
  });
  totalFound += await scanUrlList(ctx, sources.hiring_boards, {
    channel: 'hiring_site',
    source_type: 'direct_job',
    fetch_type: 'basic'
  });
  totalFound += await scanUrlList(ctx, sources.tenders_and_signals, {
    channel: 'tender',
    source_type: 'hidden_signal',
    offbeat: true,
    fetch_type: 'basic'
  });

  // TRACK B: The Experimental Frontier (Arbitrage & AI)
  ctx.log('--- TRACK B: Experimental Frontier ---');
  // Run Track B logic asynchronously to avoid blocking
  const trackB = (async () => {
    let bFound = 0;
    bFound += await scanSocialChannels(ctx, sources);
    bFound += await scanDuckDuckGo(ctx, sources.duckduckgo_queries || []);
    bFound += await scanSpecializedPlatforms(ctx);

    // Post-process with JobAgentOrchestrator for arbitrage roles
    ctx.log('--- Triggering V3 Red Teaming Loop (Sequential) ---');
    const agent = new JobAgentOrchestrator({ db });
    const arbitrageRoles = await all(db, `SELECT id FROM opportunities WHERE scan_session_id = ? AND (relevance_score > 0.1 OR source_channel != 'internal_careers')`, [sessionId]);

    let processedCount = 0;
    for (const row of arbitrageRoles) {
        await agent.processOpportunity(row.id);
        processedCount++;
        if (processedCount % 5 === 0 || processedCount === arbitrageRoles.length) {
            ctx.log(`[Progress] Analyzed ${processedCount}/${arbitrageRoles.length} signals...`);
        }
        // Small throttle to allow event loop / GC breathing room
        await ctx.sleep(100);
    }

    return bFound;
  })();

  // We wait for Track A to finish, but Track B can continue in the background if we wanted.
  // For now, we wait for both to ensure session completion logic is accurate.
  const bCount = await trackB;
  totalFound += bCount;

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
