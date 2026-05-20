import { smartFetch, stripHtml, extractLines } from '../lib/fetch.js';
import { roleFromSnippet, upsertOpportunity, upsertContact } from '../lib/persist.js';

export async function scanUrlList(ctx, items, opts = {}) {
  const { source_type = 'direct_job', offbeat = false } = opts;
  let found = 0;

  for (const item of items) {
    const url = item.url;
    const started = Date.now();
    const fetchType = item.type || opts.fetch_type || 'basic';
    ctx.log(`Scanning ${item.name || url} [${fetchType}]`);

    const page = await smartFetch(url, { type: fetchType });
    const status = page.ok ? 'Success' : 'Failed';
    const details = page.ok
      ? `Fetched ${page.html.length} bytes from ${page.final_url}`
      : `HTTP ${page.status || 'error'}: ${page.error || 'blocked or unreachable'}`;

    if (page.ok) {
      let text = stripHtml(page.html);
      let lines = extractLines(text, 20, 500); // Increased max len to capture context

      // CONTACT SCRAPING: Parse for industry professionals
      const contactRegex = /(?:Director|Head|Manager|Lead|Founder|Procurement|Delivery)\s+(?:of\s+)?([^|\-\n,]{3,30})(?:\s+[|\-]\s+([^|\-\n,]{3,30}))?/gi;
      const profileLinkRegex = /href=["'](https?:\/\/(?:www\.)?linkedin\.com\/in\/[^"']+)["']/gi;

      const potentialContacts = [...text.matchAll(contactRegex)];
      const profileLinks = [...page.html.matchAll(profileLinkRegex)].map(m => m[1]);

      for (let i = 0; i < Math.min(potentialContacts.length, profileLinks.length); i++) {
        const contactMatch = potentialContacts[i];
        await upsertContact(ctx.db, ctx.run, {
          company_name: item.company || item.name || 'Unknown',
          person_name: contactMatch[1].trim(),
          designation: contactMatch[0].trim(),
          profile_url: profileLinks[i],
          source_platform: profileLinks[i].includes('linkedin.com') ? 'LinkedIn' : 'Web',
          inferred_connection_reason: `Target Lead for ${item.sector || 'Industrial Sector'}`
        });
      }

      // Look for specific job links in the HTML
      const linkRegex = /href=["'](https?:\/\/[^"']*(?:job|vacancy|career|opening)[^"']*)["']/gi;
      const sublinks = [...page.html.matchAll(linkRegex)].map(m => m[1]).slice(0, 10);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const role = roleFromSnippet(line, item.company || item.name) || {
          role_title: line.slice(0, 100),
          company_name: item.company || item.name || 'Unknown',
          relevance_score: 0.1
        };

        // Contextual extraction: capture surrounding lines as description/requirements
        const context = lines.slice(Math.max(0, i - 1), i + 4).join('\n');
        const requirementsMatch = context.match(/(?:Requirements|Skills|Qualification|Experience):?\s*([\s\S]{20,500})/i);
        const description = context.slice(0, 1000);

        // Metro city detection
        const metros = ['Mumbai', 'Delhi', 'Bangalore', 'Bengaluru', 'Hyderabad', 'Ahmedabad', 'Chennai', 'Kolkata', 'Pune', 'Surat', 'Gurgaon', 'Noida'];
        const detectedLocation = metros.find(m => context.toLowerCase().includes(m.toLowerCase())) || item.location;

        // Try to find a more specific sublink for this role if it exists
        const bestUrl = sublinks.find(sl => sl.toLowerCase().includes(role.role_title.toLowerCase().split(' ')[0])) || url;

        await upsertOpportunity(ctx.db, ctx.run, {
          ...role,
          description,
          requirements: requirementsMatch ? requirementsMatch[1] : '',
          location: detectedLocation,
          source_url: bestUrl === url ? `${url}#${encodeURIComponent(role.role_title.slice(0, 40))}` : bestUrl,
          source_channel: item.channel || opts.channel,
          source_type,
          is_offbeat: offbeat ? 1 : 0,
          notes: `Discovered on ${item.name}. ${details}`,
          scan_session_id: ctx.sessionId,
          sector: item.sector || 'Renewables',
        });
        found++;
      }
      // Memory Optimization: Clear large string payloads
      text = null;
      lines = null;
      if (page.html) page.html = '';
    }

    await ctx.logScan({
      source_name: item.name || url,
      source_channel: item.channel || opts.channel,
      url_scanned: url,
      status: `${status} (${page.fetcher || 'basic'})`,
      findings_count: found,
      details,
      duration_ms: Date.now() - started,
    });
    await ctx.sleep(400);
  }
  return found;
}
