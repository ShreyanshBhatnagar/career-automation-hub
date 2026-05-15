import { fetchPage, stripHtml, extractLines } from '../lib/fetch.js';
import { upsertOpportunity, roleFromSnippet } from '../lib/persist.js';

export async function scanCareerPortals(db, run, sources, sessionId, logScan) {
  let found = 0;
  for (const src of sources) {
    const t0 = Date.now();
    const res = await fetchPage(src.url);
    const text = stripHtml(res.html);
    const lines = extractLines(text);
    let localFound = 0;

    for (const line of lines) {
      const role = roleFromSnippet(line, src.company || src.name);
      if (!role) continue;
      await upsertOpportunity(db, run, {
        ...role,
        sector: 'Renewables / Power',
        location: 'India',
        source_url: `${src.url}#${encodeURIComponent(role.role_title.slice(0, 40))}`,
        source_channel: src.channel || 'internal_careers',
        source_type: 'direct_job',
        notes: `Scraped from ${src.name}`,
        scan_session_id: sessionId,
      });
      localFound++;
      found++;
    }

    await logScan({
      source_name: src.name,
      source_channel: src.channel || 'internal_careers',
      url_scanned: src.url,
      status: res.ok ? (localFound ? 'Success' : 'No Matches') : 'Failed',
      findings_count: localFound,
      duration_ms: Date.now() - t0,
      session_id: sessionId,
      details: res.ok
        ? `HTTP ${res.status}. Parsed ${lines.length} text blocks, ${localFound} role matches.`
        : `Fetch failed: ${res.error || `HTTP ${res.status}`}. Social/login walls may block bots.`,
    });
  }
  return found;
}
