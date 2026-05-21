import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import ProxyManager from './proxy_manager.js';

chromium.use(StealthPlugin());

/**
 * Enhanced StealthFetcher
 * Implements randomized hardware fingerprints and managed proxies.
 */
export async function stealthFetch(url, options = {}) {
  const started = Date.now();
  const profile = options.profile || 'scraping';
  const proxy = ProxyManager.getProxy(profile);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      proxy: proxy || undefined
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: Math.random() > 0.5 ? 1 : 2,
      hasTouch: Math.random() > 0.8,
    });

    const page = await context.newPage();

    // Inject randomized fingerprints (Simulated)
    await page.addInitScript(() => {
        // Overwrite WebGL renderer
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) return 'Intel Inc.';
          if (parameter === 37446) return 'Intel(R) Iris(TM) Plus Graphics 640';
          return getParameter.apply(this, arguments);
        };
    });

    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000 + Math.random() * 1000); // Human-like jitter

    const html = await page.content();
    const status = response ? response.status() : 0;

    return {
      ok: status >= 200 && status < 400,
      status,
      html,
      duration_ms: Date.now() - started,
      final_url: page.url(),
      fetcher: 'stealth-cluster'
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message,
      fetcher: 'stealth-cluster'
    };
  } finally {
    if (browser) await browser.close();
  }
}
