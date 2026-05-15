import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const windowMs = env.RATE_LIMIT_WINDOW_MS;

export const globalRateLimiter = rateLimit({
  windowMs,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
  skip: (req) => req.path === '/health',
});

export const loginRateLimiter = rateLimit({
  windowMs,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  keyGenerator: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
});

export const strictWriteLimiter = rateLimit({
  windowMs,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Write rate limit exceeded.' },
});
