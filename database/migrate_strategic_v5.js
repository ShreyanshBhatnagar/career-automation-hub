import { openDb, run } from './db.js';

async function migrate() {
  const db = openDb();
  console.log('Starting migration v5: Strategic Phase 1 Schema...');

  // Update opportunities table to match the scale-proof row layout
  const migrations = [
      `ALTER TABLE opportunities ADD COLUMN target_sector TEXT`,
      `ALTER TABLE opportunities ADD COLUMN metro_hub TEXT`,
      `ALTER TABLE opportunities ADD COLUMN raw_job_payload TEXT`,
      `ALTER TABLE opportunities ADD COLUMN associated_contacts TEXT`,
      `ALTER TABLE opportunities ADD COLUMN application_state TEXT DEFAULT 'Captured'`
  ];

  for (const sql of migrations) {
    try {
        await run(db, sql);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.error('Migration error:', e.message);
        }
    }
  }

  // Create explicit indices for fast CSV export
  await run(db, `CREATE INDEX IF NOT EXISTS idx_opp_sector_hub ON opportunities(target_sector, metro_hub)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_opp_timestamp ON opportunities(created_at)`);

  console.log('✅ Strategic Schema layout complete.');
  db.close();
}

migrate();
