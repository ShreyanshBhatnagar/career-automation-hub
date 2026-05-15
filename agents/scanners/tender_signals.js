import { fetchPage, stripHtml, extractLines } from '../lib/fetch.js';
import { upsertOpportunity } from '../lib/persist.js';

const SIGNAL_WORDS = [
  'tender', 'award', 'commissioning', 'mw', 'solar park', 'khavda', 'mnre',
  'epc', 'substation', 'data center', 'hiring', 'vacancy', 'project',
];

function isSignal(text) {
  const t = text.toLowerCase();
  return SIGNAL_WORDS.filter((w) => t.includes(w)).length >= 2;
}

export async function scanTenderSignals(db, run, all, sources, sessionId, logScan) {
  let found = 0;
  for (const src of sources) {
    const t0 = Date.now();
    const res = await fetchPage(src.url);
    const text = stripHtml(res.html);
    const lines = extractLines(text, 30, 220);
    let localFound = 0;

    for (const line of lines) {
      if (!isSignal(line)) continue;
      const title = line.slice(0, 100);
      await all(
        db,
        `INSERT INTO hidden_signals (title, source_url, summary, predicted_role_type, confidence_score)
         VALUES (?, ?, ?, ?, ?)`,
        [
          title,
          src.url,
          line,
          src.signal_type === 'project_award'
            ? 'Project Coordinator / Commissioning Lead'
            : 'EPC Hiring Signal',
          0.65,
        ]
      );

      await upsertOpportunity(db, run, {
        company_name: src.name,
        role_title: `[Signal] ${title.slice(0, 70)}`,
        sector: 'Solar / Infrastructure',
        location: 'Gujarat / India',
        source_url: `${src.url}#signal-${encodeURIComponent(title.slice(0, 25))}`,
        source_channel: src.channel,
        source_type: 'hidden_signal',
        is_offbeat: 1,
        notes: `Hidden signal (${src.signal_type}): likely upcoming hire — reach out before job is posted publicly.`,
        raw_snippet: line,
        scan_session_id: sessionId,
      });
      localFound++;
      found++;
    }

    await logScan({
      source_name: src.name,
      source_channel: src.channel,
      url_scanned: src.url,
      status: res.ok ? (localFound ? 'Success' : 'No Matches') : 'Failed',
      findings_count: localFound,
      duration_ms: Date.now() - t0,
      session_id: sessionId,
      details: res.ok
        ? `${localFound} hidden signals (tenders/news) — roles often invisible on LinkedIn.`
        : `Could not read ${src.url}: ${res.error || res.status}`,
    });
  }
  return found;
}
