const SECTOR_SCANS = [
  {
    name:     'Semiconductors & Foundry',
    interval: 6 * 60 * 60 * 1000,   // every 6h
    scanner:  () => import('./scanners/track_semiconductors.js')
                     .then(m => m.scanSemiconductors),
  },
  {
    name:     'Data Center Infrastructure',
    interval: 6 * 60 * 60 * 1000,
    scanner:  () => import('./scanners/track_datacenters.js')
                     .then(m => m.scanDataCenters),
  },
  {
    name:     'Renewables & EPC',
    interval: 4 * 60 * 60 * 1000,   // every 4h — highest signal density
    scanner:  () => import('./scanners/track_renewables.js')
                     .then(m => m.scanRenewables),
  },
  {
    name:     'Hidden Signals (Tenders + News)',
    interval: 3 * 60 * 60 * 1000,
    scanner:  () => Promise.resolve(
                     async (ctx) => {
                       const { scanTenderSignals } = await import('./scanners/tender_signals.js');
                       const { scanMergerMarket  } = await import('./scanners/platform_v2.js');
                       const db = ctx.db;
                       // run both signal sources in sequence
                       await scanTenderSignals(db, ctx.run, ctx.all, [], ctx.sessionId, ctx.logScan);
                       await scanMergerMarket(ctx);
                     }
                   ),
  },
  {
    name:     'Platform V2 (CutShort + IIMJobs + GitHub)',
    interval: 8 * 60 * 60 * 1000,
    scanner:  () => import('./scanners/platform_v2.js')
                     .then(m => async (ctx) => {
                       await m.scanCutShort(ctx);
                       await m.scanIimjobs(ctx);
                       await m.scanGitHubJobs(ctx);
                       await m.scanFounderModes(ctx);
                     }),
  },
];

export function startSectorSchedules() {
  for (const sector of SECTOR_SCANS) {
    // Stagger initial run by 30s per sector to avoid thundering herd
    const stagger = SECTOR_SCANS.indexOf(sector) * 30000;
    setTimeout(async () => {
      const run = async () => {
        const { openDb, run: dbRun, all } = await import('../database/db.js');
        const db = openDb();
        const sessionId = `sector-${sector.name.replace(/\s+/g,'-').toLowerCase()}-${Date.now()}`;
        const ctx = {
          db, run: dbRun, all,
          sessionId,
          log: (m) => console.log(`[Scheduler:${sector.name}] ${m}`),
          sleep: (ms) => new Promise(r => setTimeout(r, ms)),
          async logScan(entry) {
            await dbRun(db,
              `INSERT INTO scan_logs
                (source_name,source_channel,url_scanned,status,
                 findings_count,details,duration_ms,session_id)
               VALUES (?,?,?,?,?,?,?,?)`,
              [entry.source_name, entry.source_channel, entry.url_scanned,
               entry.status, entry.findings_count, entry.details,
               entry.duration_ms || 0, sessionId]
            );
          },
        };
        try {
          const getScanner = await sector.scanner();
          await getScanner(ctx);
          console.log(`[Scheduler] ${sector.name} scan complete`);
        } catch(e) {
          console.error(`[Scheduler] ${sector.name} failed:`, e.message);
        } finally {
          db.close();
        }
      };
      await run();
      setInterval(run, sector.interval);
    }, stagger);
  }
  console.log('[Scheduler] Sector scan schedules armed');
}
