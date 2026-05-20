import { scoreOpportunity, matchesRoleKeywords } from '../../logic/relevance.js';

export async function upsertOpportunity(db, run, row) {
  const source_url = row.source_url || `generated://${row.scan_session_id}/${encodeURIComponent(row.role_title)}/${row.company_name}`;

  const sql = `
    INSERT INTO opportunities (
      company_name, role_title, sector, location, source_url, relevance_score,
      notes, description, requirements, status, source_channel, source_type, is_offbeat, raw_snippet,
      last_scanned_at, scan_session_id
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'Raw Ingested', ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(source_url) DO UPDATE SET
      notes = excluded.notes,
      description = excluded.description,
      requirements = excluded.requirements,
      last_scanned_at = datetime('now'),
      scan_session_id = excluded.scan_session_id,
      raw_snippet = excluded.raw_snippet
  `;

  const result = await run(db, sql, [
    row.company_name,
    row.role_title,
    row.sector || 'Renewables',
    row.location || 'India',
    source_url,
    row.notes || 'Awaiting V3 Agent evaluation...',
    row.description || '',
    row.requirements || '',
    row.source_channel,
    row.source_type || 'direct_job',
    row.is_offbeat || 0,
    row.raw_snippet || '',
    row.scan_session_id,
  ]);
  return { id: result.lastID, source_url };
}

export async function upsertContact(db, run, contact) {
  const sql = `
    INSERT INTO lead_contacts (
      company_name, person_name, designation, profile_url, source_platform, inferred_connection_reason
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_url) DO UPDATE SET
      designation = excluded.designation,
      inferred_connection_reason = excluded.inferred_connection_reason
  `;

  await run(db, sql, [
    contact.company_name,
    contact.person_name,
    contact.designation,
    contact.profile_url,
    contact.source_platform || 'LinkedIn',
    contact.inferred_connection_reason || 'Found via industrial sector scan'
  ]);
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
