import 'dotenv/config';

function required(name, { devDefault } = {}) {
  const v = process.env[name];
  if (v) return v;
  if (devDefault !== undefined && process.env.NODE_ENV !== 'production') return devDefault;
  if (devDefault !== undefined && process.env.ALLOW_DEV_DEFAULTS === 'true') return devDefault;
  return null;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 3000,
  SESSION_SECRET: required('SESSION_SECRET', { devDefault: 'dev-only-change-in-production' }),
  JWT_SECRET: required('JWT_SECRET', { devDefault: 'dev-jwt-change-in-production' }),
  ADMIN_USERNAME: required('ADMIN_USERNAME', { devDefault: 'admin' }),
  ADMIN_PASSWORD: required('ADMIN_PASSWORD', { devDefault: 'changeme' }),
  INTERNAL_API_KEY: required('INTERNAL_API_KEY', { devDefault: 'dev-internal-api-key' }),
  HUB_URL: process.env.HUB_URL || 'http://localhost:3000',
  N8N_API_KEY: process.env.N8N_API_KEY || '',
  N8N_BASE_URL: process.env.N8N_BASE_URL || 'http://localhost:5678',
  SERPAPI_KEY: process.env.SERPAPI_KEY || '',
  SCRAPER_API_KEY: process.env.SCRAPER_API_KEY || '',
  SCRAPER_API_URL: process.env.SCRAPER_API_URL || 'https://api.scrapingbee.com/v1',
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 100,
  LOGIN_RATE_LIMIT_MAX: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 5,
};

export function assertProductionSecrets() {
  if (env.NODE_ENV !== 'production') return;
  const missing = ['SESSION_SECRET', 'JWT_SECRET', 'ADMIN_PASSWORD', 'INTERNAL_API_KEY'].filter(
    (k) => !process.env[k] || String(process.env[k]).startsWith('dev-')
  );
  if (missing.length) {
    throw new Error(`Missing production secrets: ${missing.join(', ')}`);
  }
}
