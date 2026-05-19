import { chromium } from 'playwright';

/**
 * StealthFetcher
 * Implements XHR interception and TLS-mimicry headers to bypass
 * basic anti-bot protections.
 */
export async function stealthFetch(url, options = {}) {
  const started = Date.now();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1'
      }
    });

    const page = await context.newPage();

    // XHR/GraphQL Interception
    const interceptedData = [];
    page.on('response', async (response) => {
      const request = response.request();
      if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
        try {
          const json = await response.json();
          interceptedData.push({ url: request.url(), data: json });
        } catch (e) {
          // Not JSON or couldn't parse
        }
      }
    });

    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    return {
      ok: response.status() < 400,
      status: response.status(),
      html: await page.content(),
      intercepted: interceptedData.slice(0, 5), // Return first 5 XHR payloads
      duration_ms: Date.now() - started,
      final_url: page.url(),
      fetcher: 'stealth'
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message,
      fetcher: 'stealth'
    };
  } finally {
    if (browser) await browser.close();
  }
}
