import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { openDb, all, run, get } from '../database/db.js';
import { runDeepScan } from '../agents/orchestrator.js';
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

try {
  execSync('node database/migrate.js', { stdio: 'pipe', cwd: path.resolve('.') });
} catch (_) {}

app.use('/auth', authRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'active', scanInProgress });
});

app.use(express.static(path.resolve('./public')));

app.get('/profile', requireUser, (req, res) => {
  const profilePath = path.resolve('./docs/brother_profile.json');
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

app.get('/opportunities', requireUser, validateOpportunityQuery, withDb(async (db, req, res, done) => {
  const { channel, offbeat, min_score } = req.query;
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
  sql += ` ORDER BY relevance_score DESC, last_scanned_at DESC, created_at DESC LIMIT 500`;
  done(null, await all(db, sql, params));
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
    });
});

app.get('/scan/status', requireUser, withDb(async (db, req, res, done) => {
  const lastLog = await get(db, `SELECT * FROM scan_logs ORDER BY scanned_at DESC LIMIT 1`);
  res.json({ scanInProgress, lastScanResult, lastLog });
}));

app.listen(PORT, () => {
  console.log(`🚀 Career Hub API running at http://localhost:${PORT}`);
  console.log(`🔐 Auth: POST /auth/login (rate limited: ${env.LOGIN_RATE_LIMIT_MAX}/15min)`);
});
