import { upsertOpportunity } from '../lib/persist.js';

/**
 * Social platforms block unauthenticated scraping.
 * We register each platform search URL as a tracked lead + log the scan attempt.
 * When SERPAPI_KEY is set, real results can be merged later.
 */
export async function scanSocialChannels(ctx, sources) {
  let found = 0;
  const channels = [
    { key: 'linkedin', label: 'LinkedIn Jobs', items: sources.linkedin?.search_urls || [], channel: 'linkedin' },
    { key: 'instagram', label: 'Instagram', items: sources.instagram?.search_urls || [], channel: 'instagram' },
    { key: 'x_twitter', label: 'X (Twitter)', items: sources.x_twitter?.search_urls || [], channel: 'x' },
    { key: 'facebook', label: 'Facebook', items: sources.facebook?.search_urls || [], channel: 'facebook' },
  ];

  for (const ch of channels) {
    const started = Date.now();
    let count = 0;
    for (const url of ch.items) {
      await upsertOpportunity(ctx.db, ctx.run, {
        company_name: ch.label,
        role_title: `Social radar: ${ch.label} live search`,
        source_url: url,
        source_channel: ch.channel,
        source_type: 'social_radar',
        is_offbeat: 1,
        notes: `Tracked search URL — open to check latest posts. Platform may block bots; use logged-in browser or n8n connector for full scrape.`,
        scan_session_id: ctx.sessionId,
        sector: 'Renewables',
        location: 'India',
      });
      count++;
      found++;
    }
    const hashtags = sources.instagram?.hashtags || [];
    for (const tag of hashtags) {
      const url = `https://www.instagram.com/explore/tags/${tag.replace('#', '')}/`;
      await upsertOpportunity(ctx.db, ctx.run, {
        company_name: 'Instagram',
        role_title: `Hashtag watch: ${tag}`,
        source_url: url,
        source_channel: 'instagram',
        source_type: 'social_radar',
        is_offbeat: 1,
        notes: `Monitoring hashtag ${tag} for hiring posts`,
        scan_session_id: ctx.sessionId,
      });
      count++;
      found++;
    }

    await ctx.logScan({
      source_name: ch.label,
      source_channel: ch.channel,
      url_scanned: ch.items[0] || 'n/a',
      status: count ? 'Indexed' : 'No Matches',
      findings_count: count,
      details: `${count} search targets registered. Auth-required platforms: use browser session or API key for live posts.`,
      duration_ms: Date.now() - started,
    });
  }
  return found;
}
