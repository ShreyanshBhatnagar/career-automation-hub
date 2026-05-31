import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { smartFetch } from '../lib/fetch.js';
import { upsertOpportunity } from '../lib/persist.js';

/**
 * Track Data Centers Scanner
 */
export async function scanDataCenters(ctx) {
    const trackName = 'Data Centers';
    const profile = JSON.parse(fs.readFileSync(path.resolve('./config/profile_vault.json'), 'utf-8'));

    const { get } = await import('../../database/db.js');
    const lastLog = await get(ctx.db, `SELECT MAX(scanned_at) as at FROM scan_logs WHERE source_name = ?`, [trackName]);
    const delta_t = lastLog?.at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    ctx.log(`Running Track: ${trackName}. Δt filter: ${delta_t}`);

    const midGrid = profile.operational_boundaries.geographic_grid['Mid'].join(' OR ');

    const query = `"Data Center" power infrastructure hiring ${midGrid}`;
    const page = await smartFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { type: 'stealth' });
    if (page.ok) {
        await upsertOpportunity(ctx.db, ctx.run, {
            company_name: 'Industrial Lead',
            role_title: `Data Center Op: ${query.slice(0, 30)}`,
            target_sector: trackName,
            metro_hub: 'Mid-India',
            source_url: `https://discovery.industrial/${crypto.randomUUID()}`,
            raw_job_payload: JSON.stringify({ query, timestamp: new Date().toISOString() }),
            scan_session_id: ctx.sessionId,
            source_channel: 'track_scanner'
        });
    }

    return { trackName, delta_t };
}
