const LIMITS = {
  company_name: 200,
  role_title: 300,
  sector: 100,
  location: 150,
  source_url: 2048,
  notes: 4000,
  description: 10000,
  requirements: 5000,
  source_channel: 64,
  source_type: 64,
  source_name: 200,
  status: 64,
  details: 4000,
  url_scanned: 2048,
  session_id: 64,
  username: 64,
  password: 128,
};

const ALLOWED_CHANNELS = new Set([
  'linkedin', 'instagram', 'x', 'facebook', 'internal_careers', 'hiring_site',
  'tender', 'mnre', 'news', 'duckduckgo', 'web', 'manual',
]);

export function rejectOversizedBody(req, res, next) {
  const len = Number(req.headers['content-length'] || 0);
  if (len > 51200) {
    return res.status(413).json({ error: 'Request body too large (max 50KB).' });
  }
  next();
}

function hasPrototypePollution(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(obj, '__proto__')) return true;
  if (Object.prototype.hasOwnProperty.call(obj, 'constructor')) return true;
  if (Object.prototype.hasOwnProperty.call(obj, 'prototype')) return true;
  for (const k of Object.keys(obj)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
    if (typeof obj[k] === 'object' && hasPrototypePollution(obj[k])) return true;
  }
  return false;
}

export function sanitizeString(value, maxLen, { allowEmpty = false } = {}) {
  if (value === null || value === undefined) {
    return allowEmpty ? '' : null;
  }
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return null;
  }
  const s = String(value).replace(/\0/g, '').trim();
  if (s.length > maxLen) return null;
  if (!allowEmpty && !s.length) return null;
  return s;
}

function sanitizeUrl(value) {
  const s = sanitizeString(value, LIMITS.source_url, { allowEmpty: true });
  if (!s) return null;
  try {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u.href.slice(0, LIMITS.source_url);
  } catch {
    return null;
  }
}

function sanitizeScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return Math.round(n * 1000) / 1000;
}

function sanitizeInt(value, min, max, fallback) {
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function validateBody(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Malformed JSON body.' });
  }
  if (hasPrototypePollution(req.body)) {
    return res.status(400).json({ error: 'Invalid request payload.' });
  }
  next();
}

export function validateOpportunityBody(req, res, next) {
  const b = req.body;
  const company_name = sanitizeString(b.company_name, LIMITS.company_name);
  const role_title = sanitizeString(b.role_title, LIMITS.role_title);
  if (!company_name || !role_title) {
    return res.status(400).json({ error: 'company_name and role_title are required and must be valid strings.' });
  }
  const source_channel = sanitizeString(b.source_channel, LIMITS.source_channel, { allowEmpty: true }) || 'manual';
  if (!ALLOWED_CHANNELS.has(source_channel) && source_channel !== 'manual') {
    return res.status(400).json({ error: 'Invalid source_channel.' });
  }
  req.sanitized = {
    company_name,
    role_title,
    sector: sanitizeString(b.sector, LIMITS.sector, { allowEmpty: true }),
    location: sanitizeString(b.location, LIMITS.location, { allowEmpty: true }),
    source_url: sanitizeUrl(b.source_url),
    relevance_score: sanitizeScore(b.relevance_score),
    notes: sanitizeString(b.notes, LIMITS.notes, { allowEmpty: true }),
    description: sanitizeString(b.description, LIMITS.description, { allowEmpty: true }),
    requirements: sanitizeString(b.requirements, LIMITS.requirements, { allowEmpty: true }),
    source_channel,
    source_type: sanitizeString(b.source_type, LIMITS.source_type, { allowEmpty: true }) || 'direct_job',
    is_offbeat: b.is_offbeat ? 1 : 0,
  };
  next();
}

export function validateScanLogBody(req, res, next) {
  const b = req.body;
  const source_name = sanitizeString(b.source_name, LIMITS.source_name);
  const status = sanitizeString(b.status, LIMITS.status);
  if (!source_name || !status) {
    return res.status(400).json({ error: 'source_name and status are required.' });
  }
  req.sanitized = {
    source_name,
    status,
    findings_count: sanitizeInt(b.findings_count, 0, 10000, 0),
    details: sanitizeString(b.details, LIMITS.details, { allowEmpty: true }),
    source_channel: sanitizeString(b.source_channel, LIMITS.source_channel, { allowEmpty: true }),
    url_scanned: sanitizeUrl(b.url_scanned) || sanitizeString(b.url_scanned, LIMITS.url_scanned, { allowEmpty: true }),
    duration_ms: sanitizeInt(b.duration_ms, 0, 600000, 0),
    session_id: sanitizeString(b.session_id, LIMITS.session_id, { allowEmpty: true }),
  };
  next();
}

export function validateLoginBody(req, res, next) {
  const username = sanitizeString(req.body?.username, LIMITS.username);
  const password = sanitizeString(req.body?.password, LIMITS.password);
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required.' });
  }
  req.sanitized = { username, password };
  next();
}

export function validateOpportunityQuery(req, res, next) {
  const channel = req.query.channel;
  if (channel) {
    const c = sanitizeString(channel, LIMITS.source_channel);
    if (!c || (!ALLOWED_CHANNELS.has(c) && c !== 'manual')) {
      return res.status(400).json({ error: 'Invalid channel filter.' });
    }
    req.query.channel = c;
  }
  if (req.query.offbeat !== undefined && !['0', '1', ''].includes(String(req.query.offbeat))) {
    return res.status(400).json({ error: 'Invalid offbeat filter.' });
  }
  if (req.query.min_score !== undefined && req.query.min_score !== '') {
    const s = sanitizeScore(req.query.min_score);
    if (s === null) return res.status(400).json({ error: 'Invalid min_score (0–1).' });
    req.query.min_score = String(s);
  }
  if (req.query.session) {
    const sid = sanitizeString(req.query.session, LIMITS.session_id);
    if (!sid) return res.status(400).json({ error: 'Invalid session id.' });
    req.query.session = sid;
  }
  if (req.query.limit !== undefined) {
    req.query.limit = String(sanitizeInt(req.query.limit, 1, 100, 10));
  }
  next();
}
