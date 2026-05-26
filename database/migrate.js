import { openDb, run, all } from './db.js';

const MIGRATIONS = [
  `ALTER TABLE opportunities ADD COLUMN source_channel TEXT`,
  `ALTER TABLE opportunities ADD COLUMN source_type TEXT DEFAULT 'direct_job'`,
  `ALTER TABLE opportunities ADD COLUMN is_offbeat INTEGER DEFAULT 0`,
  `ALTER TABLE opportunities ADD COLUMN raw_snippet TEXT`,
  `ALTER TABLE opportunities ADD COLUMN last_scanned_at TIMESTAMP`,
  `ALTER TABLE opportunities ADD COLUMN scan_session_id TEXT`,
  `ALTER TABLE scan_logs ADD COLUMN source_channel TEXT`,
  `ALTER TABLE scan_logs ADD COLUMN url_scanned TEXT`,
  `ALTER TABLE scan_logs ADD COLUMN duration_ms INTEGER`,
  `ALTER TABLE scan_logs ADD COLUMN session_id TEXT`,
  `ALTER TABLE opportunities ADD COLUMN description TEXT`,
  `ALTER TABLE opportunities ADD COLUMN requirements TEXT`,
  `ALTER TABLE opportunities ADD COLUMN tailored_pitch TEXT`,
];

/**
 * Exported so api/server.js can await it before accepting traffic.
 * Also runnable standalone: `node database/migrate.js`
 */
export async function migrate() {
  const db = openDb();
  try {
    for (const sql of MIGRATIONS) {
      try {
        await run(db, sql);
      } catch (e) {
        // SQLite reports duplicate columns as an error — that's expected on re-runs
        if (!String(e.message).includes('duplicate column')) throw e;
      }
    }

    // Create scan_sessions table if it doesn't exist yet
    const tables = await all(
      db,
      `SELECT name FROM sqlite_master WHERE type='table' AND name='scan_sessions'`
    );
    if (!tables.length) {
      await run(
        db,
        `CREATE TABLE scan_sessions (
          id TEXT PRIMARY KEY,
          started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          finished_at TIMESTAMP,
          sources_checked INTEGER DEFAULT 0,
          roles_found INTEGER DEFAULT 0,
          status TEXT DEFAULT 'running'
        )`
      );
    }

    console.log('✅ Database migrations applied');
  } finally {
    db.close();
  }
}

// CLI entry point
if (process.argv[1]?.endsWith('migrate.js')) {
  migrate().catch((e) => {
    console.error('Migration failed:', e.message);
    process.exit(1);
  });
}
