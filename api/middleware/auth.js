import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';

const COOKIE_NAME = 'career_session';

export function signToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '8h', algorithm: 'HS256' });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'strict' });
}

function tokenFromRequest(req) {
  const cookie = req.cookies?.[COOKIE_NAME];
  if (cookie) return cookie;
  const hdr = req.headers.authorization;
  if (hdr?.startsWith('Bearer ')) return hdr.slice(7);
  return null;
}

/** Timing-safe string comparison — prevents timing attacks on credential checks */
function safeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // Still run a dummy comparison to avoid length-based timing leak
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export function requireUser(req, res, next) {
  // Basic Auth fallback for CLI tools — password may contain colons
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx !== -1) {
      const username = decoded.slice(0, colonIdx);
      const password = decoded.slice(colonIdx + 1);
      if (safeStringEqual(username, env.ADMIN_USERNAME) && safeStringEqual(password, env.ADMIN_PASSWORD)) {
        req.user = { sub: username, role: 'admin' };
        return next();
      }
    }
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = tokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    req.user = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

export function requireInternalApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || !safeStringEqual(key, env.INTERNAL_API_KEY)) {
    return res.status(401).json({ error: 'Invalid API key.' });
  }
  req.isInternal = true;
  next();
}

/** Dashboard user JWT or internal agent API key */
export function requireUserOrApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (key && safeStringEqual(key, env.INTERNAL_API_KEY)) {
    req.isInternal = true;
    return next();
  }
  return requireUser(req, res, next);
}

export { COOKIE_NAME };
