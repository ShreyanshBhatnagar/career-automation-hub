/**
 * database/init.js
 *
 * Schema initialisation — creates every table with CREATE TABLE IF NOT EXISTS
 * so it is safe to run on every startup and on a brand-new database alike.
 *
 * This must run BEFORE migrate.js. The startup sequence is:
 *   1. node database/init.js      ← creates tables (idempotent)
 *   2. node database/migrate.js   ← adds columns to existing tables (idempotent)
 *   3. node api/server.js         ← server calls both in order before accepting traffic
 *
 * ES module — run with: node database/init.js
 */

import { openDb, run, all, DB_PATH } from './db.js';

// ── Full schema — every table the application touches ─────────────────────
//
// Column set here is the UNION of schema.sql + every ALTER TABLE in migrate.js
// so a fresh database gets the complete final shape in one shot, with no need
// to run the migration ALTER statements on a new install.

const TABLES = [
  // ── Core opportunity feed ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS opportunities (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name     TEXT    NOT NULL,
    role_title       TEXT    NOT NULL,
    sector           TEXT,
    location         TEXT,
    source_url       TEXT    UNIQUE,
    relevance_score  REAL,
    status           TEXT    DEFAULT 'New',
    next_action      TEXT,
    notes            TEXT,
    description      TEXT,
    requirements     TEXT,
    tailored_pitch   TEXT,
    posted_at        TIMESTAMP,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- columns added by migrate.js (included here so fresh installs skip ALTER TABLE)
    source_channel   TEXT,
    source_type      TEXT    DEFAULT 'direct_job',
    is_offbeat       INTEGER DEFAULT 0,
    raw_snippet      TEXT,
    last_scanned_at  TIMESTAMP,
    scan_session_id  TEXT
  )`,

  // ── Recruiter / procurement contacts (Pane 3 — Outreach Vault) ───────────
  `CREATE TABLE IF NOT EXISTS lead_contacts (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name                TEXT,
    person_name                 TEXT,
    designation                 TEXT,
    profile_url                 TEXT    UNIQUE,
    source_platform             TEXT,
    inferred_connection_reason  TEXT,
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── Legacy contacts table (kept for backwards compatibility) ─────────────
  `CREATE TABLE IF NOT EXISTS contacts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT    NOT NULL,
    title             TEXT,
    company           TEXT,
    relation_strength TEXT,
    last_contacted_at TIMESTAMP,
    notes             TEXT
  )`,

  // ── HITL action queue ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS actions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id  INTEGER,
    action_type     TEXT,
    due_date        DATE,
    status          TEXT    DEFAULT 'Open',
    FOREIGN KEY (opportunity_id) REFERENCES opportunities(id)
  )`,

  // ── Scan audit trail ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS scan_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name     TEXT    NOT NULL,
    status          TEXT,
    findings_count  INTEGER DEFAULT 0,
    details         TEXT,
    scanned_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- columns added by migrate.js
    source_channel  TEXT,
    url_scanned     TEXT,
    duration_ms     INTEGER,
    session_id      TEXT
  )`,

  // ── Scan session registry ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS scan_sessions (
    id               TEXT    PRIMARY KEY,
    started_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at      TIMESTAMP,
    sources_checked  INTEGER DEFAULT 0,
    roles_found      INTEGER DEFAULT 0,
    status           TEXT    DEFAULT 'running'
  )`,

  // ── Hidden signals / future hiring intelligence ──────────────────────────
  `CREATE TABLE IF NOT EXISTS hidden_signals (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    title               TEXT,
    source_url          TEXT,
    summary             TEXT,
    predicted_role_type TEXT,
    confidence_score    REAL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
];

// ── Exported function — called by server.js before migrate() ─────────────

/**
 * Creates all tables if they do not already exist.
 * Safe to call on every startup — CREATE TABLE IF NOT EXISTS is idempotent.
 *
 * @returns {Promise<{ created: string[], existing: string[] }>}
 */
export async function initSchema() {
  const db = openDb();
  const created = [];
  const existing = [];

  try {
    // Snapshot which tables exist before we start
    const before = await all(
      db,
      `SELECT name FROM sqlite_master WHERE type='table'`
    );
    const existingNames = new Set(before.map((r) => r.name));

    for (const sql of TABLES) {
      // Extract table name from the CREATE TABLE IF NOT EXISTS statement
      const match = sql.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i);
      const tableName = match ? match[1] : '(unknown)';

      await run(db, sql);

      if (existingNames.has(tableName)) {
        existing.push(tableName);
      } else {
        created.push(tableName);
      }
    }

    // Summary line — always printed so the startup sequence is auditable
    if (created.length > 0) {
      console.log(`✅ [init] Created tables: ${created.join(', ')}`);
    }
    if (existing.length > 0) {
      console.log(`✅ [init] Tables already exist (skipped): ${existing.join(', ')}`);
    }
    console.log(`✅ [init] Schema initialisation complete — DB: ${DB_PATH}`);

    return { created, existing };
  } finally {
    db.close();
  }
}

// ── CLI entry point ───────────────────────────────────────────────────────
// Runs when executed directly: node database/init.js
// Exits 0 on success, 1 on failure so it can be chained in npm scripts.

const isMain = process.argv[1]?.endsWith('init.js');
if (isMain) {
  initSchema()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(`❌ [init] Schema initialisation failed: ${e.message}`);
      console.error(e.stack);
      process.exit(1);
    });
}
