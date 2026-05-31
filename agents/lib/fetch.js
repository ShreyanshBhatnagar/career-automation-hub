import { chromium } from 'playwright';
import { stealthFetch } from './stealth_fetcher.js';
import { env } from '../../api/config/env.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchPage(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
      redirect: 'follow',
    });
    const html = res.ok ? await res.text() : '';
    return {
      ok: res.ok,
      status: res.status,
      html,
      duration_ms: Date.now() - started,
      final_url: res.url,
      fetcher: 'basic',
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      html: '',
      duration_ms: Date.now() - started,
      error: e.message,
      final_url: url,
      fetcher: 'basic',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function playwrightFetch(url, timeoutMs = 30000) {
  const started = Date.now();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: UA });
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });

    // Wait a bit for dynamic content
    await page.waitForTimeout(2000);

    const html = await page.content();
    const status = response ? response.status() : 0;

    return {
      ok: status >= 200 && status < 300,
      status,
      html,
      duration_ms: Date.now() - started,
      final_url: page.url(),
      fetcher: 'playwright',
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      html: '',
      duration_ms: Date.now() - started,
      error: e.message,
      final_url: url,
      fetcher: 'playwright',
    };
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * FetcherFactory
 * Routes to the appropriate fetcher based on type or requirements
 */
export async function proxiedSmartFetch(url, timeoutMs = 30000) {
  const started = Date.now();
  if (!env.SCRAPER_API_KEY) {
    throw new Error('SCRAPER_API_KEY not configured');
  }

  const apiUrl = `${env.SCRAPER_API_URL}?api_key=${env.SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render_js=true`;

  try {
    const res = await fetch(apiUrl, { timeout: timeoutMs });
    const html = res.ok ? await res.text() : '';
    return {
      ok: res.ok,
      status: res.status,
      html,
      duration_ms: Date.now() - started,
      final_url: url,
      fetcher: 'proxy-service',
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      html: '',
      duration_ms: Date.now() - started,
      error: e.message,
      final_url: url,
      fetcher: 'proxy-service',
    };
  }
}

/**
 * FetcherFactory
 * Routes to the appropriate fetcher based on type or requirements
 */
const BASE_DELAY_MS = 800;
const MAX_DELAY_MS  = 30000;

export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(
        BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 500,
        MAX_DELAY_MS
      );
      await new Promise(r => setTimeout(r, delay));
    }
    const result = await fetchPage(url, options.timeout);
    // 429 or Cloudflare challenge = back off
    if (result.status === 429 || result.status === 403) {
      lastError = result;
      continue;
    }
    if (result.ok) return result;
    lastError = result;
  }
  return { ...lastError, retries_exhausted: true };
}

const domainLastHit = new Map();
const DOMAIN_COOLDOWN = {
  'linkedin.com':   45000,
  'naukri.com':     30000,
  'glassdoor.com':  35000,
  'indeed.com':     25000,
  'default':         2000,
};

export async function rateLimitedFetch(url, options = {}) {
  let hostname;
  try { hostname = new URL(url).hostname.replace('www.', ''); }
  catch { hostname = 'unknown'; }

  const cooldown = DOMAIN_COOLDOWN[hostname] || DOMAIN_COOLDOWN.default;
  const lastHit  = domainLastHit.get(hostname) || 0;
  const wait     = cooldown - (Date.now() - lastHit);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  domainLastHit.set(hostname, Date.now());

  return fetchWithRetry(url, options);
}

/**
 * FetcherFactory
 * Routes to the appropriate fetcher based on type or requirements
 */
export async function smartFetch(url, options = {}) {
  const { type = 'basic', timeout } = options;

  if (type === 'proxy' || type === 'high_stealth') {
    return proxiedSmartFetch(url, timeout);
  }
  if (type === 'stealth') {
    return stealthFetch(url, options);
  }
  if (type === 'headless' || type === 'playwright') {
    return playwrightFetch(url, timeout);
  }

  // Basic fetch is default
  return rateLimitedFetch(url, options);
}

export function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractLines(text, minLen = 20, maxLen = 200) {
  const lines = [];
  const parts = text.split(/[.|\n•·▪]/);
  for (const p of parts) {
    const s = p.trim();
    if (s.length >= minLen && s.length <= maxLen) lines.push(s);
  }
  return [...new Set(lines)].slice(0, 80);
}
