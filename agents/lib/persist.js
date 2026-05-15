import { scoreOpportunity, matchesRoleKeywords } from '../../logic/relevance.js';

export async function upsertOpportunity(db, run, row) {
  const scored = scoreOpportunity(row);
  const source_url = row.source_url || `generated://${row.scan_session_id}/${encodeURIComponent(row.role_title)}/${row.company_name}`;

  const sql = `
    INSERT INTO opportunities (
      company_name, role_title, sector, location, source_url, relevance_score,
      notes, status, source_channel, source_type, is_offbeat, raw_snippet,
      last_scanned_at, scan_session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'New', ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(source_url) DO UPDATE SET
      relevance_score = excluded.relevance_score,
      notes = excluded.notes,
      last_scanned_at = datetime('now'),
      scan_session_id = excluded.scan_session_id,
      is_offbeat = excluded.is_offbeat,
      raw_snippet = excluded.raw_snippet
  `;

  await run(db, sql, [
    row.company_name,
    row.role_title,
    row.sector || 'Renewables',
    row.location || 'India',
    source_url,
    scored.relevance_score,
    row.notes || scored.match_reasons.join(', '),
    row.source_channel,
    row.source_type || 'direct_job',
    row.is_offbeat ?? scored.is_offbeat,
    row.raw_snippet || '',
    row.scan_session_id,
  ]);
  return { source_url, scored };
}

export function roleFromSnippet(snippet, company = 'Unknown') {
  if (!matchesRoleKeywords(snippet)) return null;
  const title = snippet.slice(0, 120).replace(/\s+/g, ' ').trim();
  return {
    company_name: company,
    role_title: title.length > 80 ? title.slice(0, 77) + '...' : title,
    raw_snippet: snippet,
  };
}
