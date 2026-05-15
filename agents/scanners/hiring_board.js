import { fetchPage, stripHtml, extractLines } from '../lib/fetch.js';
import { upsertOpportunity, roleFromSnippet } from '../lib/persist.js';

export async function scanHiringBoards(db, run, sources, sessionId, logScan) {
  let found = 0;
  for (const src of sources) {
    const t0 = Date.now();
    const res = await fetchPage(src.url);
    const text = stripHtml(res.html);
    const lines = extractLines(text, 25, 180);
    let localFound = 0;

    for (const line of lines) {
      const role = roleFromSnippet(line, 'Hiring Board');
      if (!role) continue;
      role.company_name = line.match(/at\s+([A-Z][A-Za-z0-9&.\s]{2,30})/)?.[1] || 'EPC / Hiring Board';
      await upsertOpportunity(db, run, {
        ...role,
        sector: 'Solar / Renewables',
        location: 'India',
        source_url: `${src.url}#${encodeURIComponent(role.role_title.slice(0, 30))}`,
        source_channel: 'hiring_site',
        source_type: 'direct_job',
        is_offbeat: 0,
        notes: `Found on ${src.name}`,
        scan_session_id: sessionId,
      });
      localFound++;
      found++;
    }

    await logScan({
      source_name: src.name,
      source_channel: 'hiring_site',
      url_scanned: src.url,
      status: res.ok ? (localFound ? 'Success' : 'No Matches') : 'Failed',
      findings_count: localFound,
      duration_ms: Date.now() - t0,
      session_id: sessionId,
      details: res.ok
        ? `Scanned ${src.name}. ${localFound} matches (may be partial if site uses JS rendering).`
        : `Blocked or unreachable (${res.error || res.status}).`,
    });
  }
  return found;
}
