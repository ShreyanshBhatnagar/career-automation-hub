import { openDb, run } from './db.js';

async function migrate() {
  const db = openDb();
  console.log('Starting migration v4: lead_contacts...');

  const sql = `
    CREATE TABLE IF NOT EXISTS lead_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT,
      person_name TEXT,
      designation TEXT,
      profile_url TEXT UNIQUE,
      source_platform TEXT,
      inferred_connection_reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  try {
    await run(db, sql);
    console.log('✅ Created table: lead_contacts');
  } catch (e) {
    console.error('Error during migration:', e.message);
  } finally {
    db.close();
  }
}

migrate();
