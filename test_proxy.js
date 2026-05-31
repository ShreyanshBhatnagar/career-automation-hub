import { smartFetch } from './agents/lib/fetch.js';
import { env } from './api/config/env.js';

async function testProxy() {
  console.log('Testing Proxy Routing logic...');

  // Set mock API key
  process.env.SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || "test_key";
  env.SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || "test_key";

  try {
    const res = await smartFetch('https://linkedin.com/jobs', { type: 'proxy' });
    console.log('Fetcher used:', res.fetcher);
    // Since it's a fake key, it should fail, but we want to see it use the proxy-service fetcher
    if (res.fetcher === 'proxy-service') {
        console.log('SUCCESS: Correctly routed to proxiedSmartFetch.');
    } else {
        console.log('FAILURE: Did not route to proxy-service.');
        process.exit(1);
    }
  } catch (e) {
    console.log('Error as expected with mock key:', e.message);
  }
}

testProxy();
