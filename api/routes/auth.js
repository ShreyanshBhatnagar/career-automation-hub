import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';
import { loginRateLimiter } from '../middleware/rateLimit.js';
import { validateLoginBody } from '../middleware/validate.js';
import {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireUser,
} from '../middleware/auth.js';

const router = Router();

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

router.post('/login', loginRateLimiter, validateLoginBody, (req, res) => {
  const { username, password } = req.sanitized;
  if (!safeEqual(username, env.ADMIN_USERNAME) || !safeEqual(password, env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  const token = signToken({ sub: username, role: 'admin' });
  setAuthCookie(res, token);
  res.json({ ok: true, user: { username, role: 'admin' } });
});

router.post('/logout', requireUser, (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireUser, (req, res) => {
  res.json({ user: { username: req.user.sub, role: req.user.role } });
});

export default router;
