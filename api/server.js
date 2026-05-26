import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { openDb, all, run, get } from '../database/db.js';
import { runDeepScan } from '../agents/orchestrator.js';
import ResumeTailorAgent from '../agents/resume_tailor_agent.js';
import MessageDrafterAgent from '../agents/message_drafter_agent.js';
import { env, assertProductionSecrets } from './config/env.js';
import { globalRateLimiter, strictWriteLimiter } from './middleware/rateLimit.js';
import {
  rejectOversizedBody,
  validateBody,
  validateOpportunityBody,
  validateScanLogBody,
  validateOpportunityQuery,
} from './middleware/validate.js';
import { requireUser, requireUserOrApiKey, requireInternalApiKey } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import logger from './utils/logger.js';

// ── Profile cache — read once at startup, never on every request ──────────
let _profileCache = null;
function getProfile() {
  if (_profileCache) return _profileCache;
  const profilePath = path.resolve('./docs/brother_profile.json');
  try {
    _profileCache = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  } catch (e) {
    throw new Error(`Failed to load brother_profile.json: ${e.message}`);
  }
  return _profileCache;
}

assertProductionSecrets();

const app = express();
const PORT = env.PORT;

let scanInProgress = false;
let lastScanResult = null;

function getDb() {
  return openDb();
}

function withDb(handler) {
  return (req, res) => {
    const db = getDb();
    const finish = (err, payload, status = 200) => {
      db.close();
      if (err) return res.status(status).json({ error: err.message });
      res.status(status).json(payload);
    };
    handler(db, req, res, finish).catch((e) => finish(e, null, 500));
  };
}

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(globalRateLimiter);
app.use(cookieParser());
app.use(bodyParser.json({ limit: '50kb' }));
app.use(rejectOversizedBody);
app.use(validateBody);

// ── Schema init + migrations — must complete before accepting any traffic ──
async function runMigrations() {
  const { initSchema } = await import('../database/init.js');
  const { migrate }    = await import('../database/migrate.js');
  await initSchema();   // CREATE TABLE IF NOT EXISTS — safe on every boot
  await migrate();      // ALTER TABLE additions — idempotent on re-runs
}
await runMigrations().catch((e) => {
  logger.error('API_SERVER', 'Migration failed — aborting startup', {
    stack_trace:    e.stack,
    beyond_remarks: 'process.exit(1) triggered — fix schema before restarting',
  });
  process.exit(1);
});

app.use('/auth', authRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'active', scanInProgress });
});

app.use(express.static(path.resolve('./public')));

app.get('/profile', requireUser, (req, res) => {
  try {
    res.json(getProfile());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/opportunities', requireUser, validateOpportunityQuery, withDb(async (db, req, res, done) => {
  const { channel, offbeat, min_score } = req.query;
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  let sql = `SELECT * FROM opportunities WHERE 1=1`;
  const params = [];
  if (channel) {
    sql += ` AND source_channel = ?`;
    params.push(channel);
  }
  if (offbeat === '1') sql += ` AND is_offbeat = 1`;
  if (min_score) {
    sql += ` AND relevance_score >= ?`;
    params.push(Number(min_score));
  }
  sql += ` ORDER BY relevance_score DESC, last_scanned_at DESC, created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  done(null, await all(db, sql, params));
}));

app.get('/leads', requireUser, withDb(async (db, req, res, done) => {
  const rows = await all(db, `SELECT * FROM lead_contacts ORDER BY created_at DESC`);
  done(null, rows);
}));

app.post('/api/opportunities/:id/tailor-resume', requireUser, withDb(async (db, req, res, done) => {
  const id = req.params.id;
  const opp = await get(db, `SELECT * FROM opportunities WHERE id = ?`, [id]);
  if (!opp) return done(new Error('Opportunity not found'), null, 404);

  const tailor = new ResumeTailorAgent();
  const profilePath = path.resolve('./docs/brother_profile.json');
  const markdown = await tailor.generateMarkdownBlock(opp.description || opp.role_title, profilePath, req.body);

  await run(db, `UPDATE opportunities SET status = 'Reviewed' WHERE id = ?`, [id]);
  done(null, { id, markdown, status: 'Success' });
}));

/**
 * POST /api/opportunities/:id/release
 * HITL gate: marks an opportunity as 'Applied' and records the release timestamp.
 * This is the "Release Application Block" action from Pane 1.
 */
app.post('/api/opportunities/:id/release', requireUser, withDb(async (db, req, res, done) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return done(new Error('Invalid opportunity id'), null, 400);
  const opp = await get(db, `SELECT id, status FROM opportunities WHERE id = ?`, [id]);
  if (!opp) return done(new Error('Opportunity not found'), null, 404);
  await run(db, `UPDATE opportunities SET status = 'Applied', next_action = 'Follow up in 5 days' WHERE id = ?`, [id]);
  done(null, { id, status: 'Applied', message: 'Application block released. Status → Applied.' });
}));

/**
 * POST /api/opportunities/:id/authorize-bridge
 * HITL gate: saves an edited bridge card context note back to the opportunity notes field.
 * Body: { bridge_context: string }
 */
app.post('/api/opportunities/:id/authorize-bridge', requireUser, withDb(async (db, req, res, done) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return done(new Error('Invalid opportunity id'), null, 400);
  const { bridge_context } = req.body || {};
  if (typeof bridge_context !== 'string' || bridge_context.length > 2000) {
    return done(new Error('bridge_context must be a string under 2000 chars'), null, 400);
  }
  const opp = await get(db, `SELECT id FROM opportunities WHERE id = ?`, [id]);
  if (!opp) return done(new Error('Opportunity not found'), null, 404);
  await run(db, `UPDATE opportunities SET notes = ?, status = 'Reviewed' WHERE id = ?`, [bridge_context.trim(), id]);
  done(null, { id, message: 'Bridge context authorized and saved.' });
}));

app.post('/api/opportunities/:id/draft-outreach', requireUser, withDb(async (db, req, res, done) => {
  const id = req.params.id;
  const opp = await get(db, `SELECT * FROM opportunities WHERE id = ?`, [id]);
  if (!opp) return done(new Error('Opportunity not found'), null, 404);

  const drafter = new MessageDrafterAgent();
  const profilePath = path.resolve('./docs/brother_profile.json');
  const message = await drafter.draftMessage(opp, profilePath);

  done(null, { id, message, status: 'Drafted' });
}));

app.post(
  '/opportunities',
  strictWriteLimiter,
  requireUserOrApiKey,
  validateOpportunityBody,
  withDb(async (db, req, res, done) => {
    const b = req.sanitized;
    const r = await run(
      db,
      `INSERT INTO opportunities (company_name, role_title, sector, location, source_url, relevance_score, notes, description, requirements, source_channel, source_type, is_offbeat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_url) DO UPDATE SET
         relevance_score=excluded.relevance_score,
         notes=excluded.notes,
         description=excluded.description,
         requirements=excluded.requirements,
         last_scanned_at=datetime('now')`,
      [
        b.company_name,
        b.role_title,
        b.sector,
        b.location,
        b.source_url,
        b.relevance_score,
        b.notes,
        b.description,
        b.requirements,
        b.source_channel,
        b.source_type,
        b.is_offbeat,
      ]
    );
    done(null, { id: r.lastID, message: 'Saved' });
  })
);

app.get('/opportunities/top', requireUser, validateOpportunityQuery, withDb(async (db, req, res, done) => {
  const limit = Number(req.query.limit) || 10;
  const rows = await all(
    db,
    `SELECT * FROM opportunities ORDER BY relevance_score DESC LIMIT ?`,
    [limit]
  );
  done(null, rows);
}));

app.get('/scan-logs', requireUser, validateOpportunityQuery, withDb(async (db, req, res, done) => {
  const session = req.query.session;
  let sql = `SELECT * FROM scan_logs ORDER BY scanned_at DESC LIMIT 100`;
  const params = [];
  if (session) {
    sql = `SELECT * FROM scan_logs WHERE session_id = ? ORDER BY scanned_at DESC`;
    params.push(session);
  }
  done(null, await all(db, sql, params));
}));

app.post(
  '/scan-logs',
  strictWriteLimiter,
  requireInternalApiKey,
  validateScanLogBody,
  withDb(async (db, req, res, done) => {
    const b = req.sanitized;
    const r = await run(
      db,
      `INSERT INTO scan_logs (source_name, source_channel, url_scanned, status, findings_count, details, duration_ms, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.source_name,
        b.source_channel,
        b.url_scanned,
        b.status,
        b.findings_count,
        b.details,
        b.duration_ms,
        b.session_id,
      ]
    );
    done(null, { id: r.lastID });
  })
);

app.get('/scan/summary', requireUser, withDb(async (db, req, res, done) => {
  const byChannel = await all(
    db,
    `SELECT source_channel, COUNT(*) as scans, SUM(findings_count) as findings,
            SUM(CASE WHEN status='Success' OR status='Indexed' THEN 1 ELSE 0 END) as ok,
            SUM(CASE WHEN status='Failed' THEN 1 ELSE 0 END) as failed
     FROM scan_logs GROUP BY source_channel ORDER BY scans DESC`
  );
  const totals = await get(db, `SELECT COUNT(*) as opportunities FROM opportunities`);
  const offbeat = await get(db, `SELECT COUNT(*) as c FROM opportunities WHERE is_offbeat=1`);
  const lastSession = await get(
    db,
    `SELECT * FROM scan_sessions ORDER BY started_at DESC LIMIT 1`
  );
  const lastScan = await get(db, `SELECT MAX(scanned_at) as at FROM scan_logs`);
  done(null, {
    totals: { opportunities: totals?.opportunities || 0, offbeat: offbeat?.c || 0 },
    byChannel,
    lastSession,
    lastScanAt: lastScan?.at,
    scanInProgress,
    lastScanResult,
  });
}));

app.get('/scan/sessions', requireUser, withDb(async (db, req, res, done) => {
  done(null, await all(db, `SELECT * FROM scan_sessions ORDER BY started_at DESC LIMIT 20`));
}));

app.post('/scan/run', strictWriteLimiter, requireUser, async (req, res) => {
  if (scanInProgress) {
    return res.status(409).json({ error: 'Scan already in progress' });
  }
  scanInProgress = true;
  res.json({ message: 'Deep scan started', status: 'running' });

  runDeepScan()
    .then((result) => {
      lastScanResult = { ...result, finishedAt: new Date().toISOString() };
      scanInProgress = false;
    })
    .catch((e) => {
      lastScanResult = { error: e.message, finishedAt: new Date().toISOString() };
      scanInProgress = false;
      logger.error('API_SERVER', 'Deep scan failed', {
        stack_trace:    e.stack,
        beyond_remarks: 'scanInProgress reset to false; last result recorded with error field',
      });
    });
});

app.get('/scan/status', requireUser, withDb(async (db, req, res, done) => {
  const lastLog = await get(db, `SELECT * FROM scan_logs ORDER BY scanned_at DESC LIMIT 1`);
  res.json({ scanInProgress, lastScanResult, lastLog });
}));

app.listen(PORT, () => {
  logger.info('API_SERVER', 'Server started', {
    beyond_remarks: `http://localhost:${PORT} | login rate limit: ${env.LOGIN_RATE_LIMIT_MAX}/15min`,
  });
});

// ── 404 handler — must be after all routes ────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// ── Global error handler — catches unhandled throws in middleware/routes ──
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = env.NODE_ENV === 'production'
    ? 'Internal server error.'
    : (err.message || 'Internal server error.');

  logger.error('API_SERVER', err.message || 'Unhandled server error', {
    source_target:  `${req.method} ${req.path}`,
    stack_trace:    err.stack,
    beyond_remarks: `HTTP ${status} returned to client | NODE_ENV=${env.NODE_ENV}`,
  });

  res.status(status).json({ error: message });
});
