import { smartFetch } from './agents/lib/fetch.js';

async function testPlaywright() {
  console.log('Testing Playwright fetch...');
  const res = await smartFetch('https://example.com', { type: 'headless' });
  console.log('Status:', res.status);
  console.log('Fetcher used:', res.fetcher);
  console.log('HTML length:', res.html.length);
  if (res.ok && res.fetcher === 'playwright') {
    console.log('SUCCESS: Playwright is working.');
    process.exit(0);
  } else {
    console.log('FAILURE: Playwright fetch failed.');
    process.exit(1);
  }
}

testPlaywright();
