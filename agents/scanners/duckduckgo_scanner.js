import { fetchPage, stripHtml } from '../lib/fetch.js';
import { upsertOpportunity } from '../lib/persist.js';

function parseDdgResults(html) {
  const links = [];
  // Standard HTML DDG results
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]+?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && links.length < 15) {
    let href = m[1];
    if (href.includes('duckduckgo.com/l/?uddg=')) {
      try {
        href = decodeURIComponent(href.split('uddg=')[1].split('&')[0]);
      } catch (e) {}
    }
    if (href.startsWith('//')) href = 'https:' + href;
    const title = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (href.includes('http')) {
      links.push({ url: href, title: title || 'Search result' });
    }
  }
  // Fallback for direct link extraction if structure changed
  if (!links.length) {
    const fallbackRe = /uddg=([^&"]+)/g;
    const matches = [...html.matchAll(fallbackRe)].slice(0, 15);
    for (const f of matches) {
      try {
        const decoded = decodeURIComponent(f[1]);
        if (decoded.includes('http') && !links.find(l => l.url === decoded)) {
          links.push({ url: decoded, title: 'Search result' });
        }
      } catch (_) {}
    }
  }
  return links;
}

export async function scanDuckDuckGo(ctx, queries) {
  let found = 0;
  for (const q of queries) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const started = Date.now();
    const page = await fetchPage(url, 15000);
    let count = 0;
    let details = page.error || `HTTP ${page.status}`;

    if (page.ok) {
      const results = parseDdgResults(page.html);
      details = `Query: "${q}" → ${results.length} links indexed`;
      for (const r of results) {
        const channel = channelFromUrl(r.url);
        const offbeat = /instagram|facebook|x\.com|twitter|mnre|tender|commissioning|referral/i.test(
          r.url + q
        );
        await upsertOpportunity(ctx.db, ctx.run, {
          company_name: hostFromUrl(r.url),
          role_title: r.title || q.slice(0, 80),
          source_url: r.url,
          source_channel: channel,
          source_type: offbeat ? 'hidden_signal' : 'social_discovery',
          is_offbeat: offbeat ? 1 : 0,
          notes: `DuckDuckGo discovery | Query: ${q}`,
          scan_session_id: ctx.sessionId,
          raw_snippet: r.title,
        });
        count++;
        found++;
      }
    }

    await ctx.logScan({
      source_name: `DuckDuckGo: ${q.slice(0, 60)}`,
      source_channel: 'duckduckgo',
      url_scanned: url,
      status: page.ok ? (count ? 'Success' : 'No Matches') : 'Failed',
      findings_count: count,
      details,
      duration_ms: Date.now() - started,
    });
    await ctx.sleep(800);
  }
  return found;
}

function hostFromUrl(u) {
  try {
    return new URL(u).hostname.replace('www.', '');
  } catch {
    return 'Web';
  }
}

function channelFromUrl(u) {
  if (/linkedin/i.test(u)) return 'linkedin';
  if (/instagram/i.test(u)) return 'instagram';
  if (/facebook/i.test(u)) return 'facebook';
  if (/x\.com|twitter/i.test(u)) return 'x';
  if (/naukri|indeed|shine|internshala/i.test(u)) return 'hiring_site';
  if (/mnre|seci|gov\.in/i.test(u)) return 'mnre';
  return 'web';
}
