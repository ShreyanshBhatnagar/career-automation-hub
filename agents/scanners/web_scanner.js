import { fetchPage, stripHtml, extractLines } from '../lib/fetch.js';
import { roleFromSnippet, upsertOpportunity } from '../lib/persist.js';

export async function scanUrlList(ctx, items, opts = {}) {
  const { source_type = 'direct_job', offbeat = false } = opts;
  let found = 0;

  for (const item of items) {
    const url = item.url;
    const started = Date.now();
    ctx.log(`Scanning ${item.name || url}`);

    const page = await fetchPage(url);
    const status = page.ok ? 'Success' : 'Failed';
    const details = page.ok
      ? `Fetched ${page.html.length} bytes from ${page.final_url}`
      : `HTTP ${page.status || 'error'}: ${page.error || 'blocked or unreachable'}`;

    if (page.ok) {
      const text = stripHtml(page.html);
      const lines = extractLines(text);
      for (const line of lines) {
        const role = roleFromSnippet(line, item.company || item.name);
        if (!role) continue;
        await upsertOpportunity(ctx.db, ctx.run, {
          ...role,
          source_url: `${url}#${encodeURIComponent(role.role_title.slice(0, 40))}`,
          source_channel: item.channel || opts.channel,
          source_type,
          is_offbeat: offbeat ? 1 : 0,
          notes: `Discovered on ${item.name}. ${details}`,
          scan_session_id: ctx.sessionId,
          location: item.location,
          sector: item.sector || 'Renewables',
        });
        found++;
      }
    }

    await ctx.logScan({
      source_name: item.name || url,
      source_channel: item.channel || opts.channel,
      url_scanned: url,
      status,
      findings_count: found,
      details,
      duration_ms: Date.now() - started,
    });
    await ctx.sleep(400);
  }
  return found;
}
