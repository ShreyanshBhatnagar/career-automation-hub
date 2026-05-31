import { fetchPage, stripHtml } from '../lib/fetch.js';
import { upsertOpportunity } from '../lib/persist.js';

export async function scanRemoteOK(ctx) {
  ctx.log('Scanning RemoteOK API...');
  const res = await fetchPage('https://remoteok.com/api');
  if (!res.ok) {
    ctx.log('RemoteOK API failed');
    return 0;
  }
  try {
    const jobs = JSON.parse(res.html);
    let found = 0;
    // RemoteOK returns [ { "legal": "..." }, { job }, { job } ... ]
    for (const job of jobs) {
      if (!job.position) continue;

      const role = {
        company_name: job.company || 'Unknown',
        role_title: job.position,
        description: stripHtml(job.description || ''),
        location: job.location || 'Remote',
        source_url: job.url,
        source_channel: 'remoteok',
        source_type: 'direct_job',
        sector: job.tags?.join(', ') || 'Tech',
        notes: `RemoteOK Job. Tags: ${job.tags?.join(', ')}`,
        scan_session_id: ctx.sessionId,
      };

      await upsertOpportunity(ctx.db, ctx.run, role);
      found++;
      if (found >= 20) break; // Limit to 20 for now
    }
    await ctx.logScan({
      source_name: 'RemoteOK',
      source_channel: 'remoteok',
      url_scanned: 'https://remoteok.com/api',
      status: 'Success',
      findings_count: found,
    });
    return found;
  } catch (e) {
    ctx.log(`RemoteOK Parse Error: ${e.message}`);
    return 0;
  }
}

export async function scanYCWorkAtAStartup(ctx) {
  ctx.log('Scanning YC Work at a Startup...');
  // YC is heavily dynamic, but we can try to find some static patterns or use search queries via DDG
  // For now, let's use a targeted search since we don't have a headless browser here
  return 0;
}

export async function scanHiringCafe(ctx) {
  ctx.log('Scanning Hiring.cafe...');
  // Hiring.cafe is also quite dynamic.
  return 0;
}

export async function scanSpecializedPlatforms(ctx) {
  let total = 0;
  total += await scanRemoteOK(ctx);
  // Add more as discovered/implemented
  return total;
}
