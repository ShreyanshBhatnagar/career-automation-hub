import { chromium } from 'playwright';

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
export async function smartFetch(url, options = {}) {
  const { type = 'basic', timeout } = options;

  if (type === 'headless' || type === 'playwright') {
    return playwrightFetch(url, timeout);
  }

  // Basic fetch is default
  return fetchPage(url, timeout);
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
