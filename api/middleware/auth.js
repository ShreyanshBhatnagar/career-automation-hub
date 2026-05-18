import jwt from 'jsonwebtoken';
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

export function requireUser(req, res, next) {
  // Allow Basic Auth for CLI tools
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    const creds = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    if (creds[0] === env.ADMIN_USERNAME && creds[1] === env.ADMIN_PASSWORD) {
      req.user = { username: creds[0] };
      return next();
    }
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
  if (!key || key !== env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key.' });
  }
  req.isInternal = true;
  next();
}

/** Dashboard user JWT or internal agent API key */
export function requireUserOrApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (key && key === env.INTERNAL_API_KEY) {
    req.isInternal = true;
    return next();
  }
  return requireUser(req, res, next);
}

export { COOKIE_NAME };
