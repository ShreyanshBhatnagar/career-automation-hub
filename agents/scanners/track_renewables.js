import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { smartFetch } from '../lib/fetch.js';
import { upsertOpportunity } from '../lib/persist.js';

/**
 * Track Renewables Scanner
 */
export async function scanRenewables(ctx) {
    const trackName = 'Renewables';
    const profile = JSON.parse(fs.readFileSync(path.resolve('./config/profile_vault.json'), 'utf-8'));

    const { get } = await import('../../database/db.js');
    const lastLog = await get(ctx.db, `SELECT MAX(scanned_at) as at FROM scan_logs WHERE source_name = ?`, [trackName]);
    const delta_t = lastLog?.at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    ctx.log(`Running Track: ${trackName}. Δt threshold: ${delta_t}`);

    const southGrid = profile.operational_boundaries.geographic_grid['South'].join(' OR ');
    const westGrid = profile.operational_boundaries.geographic_grid['North-West'].join(' OR ');

    const queries = [
        `"Solar" site implementation hiring ${westGrid}`,
        `"Wind" EPC project manager ${southGrid}`
    ];

    for (const q of queries) {
        const page = await smartFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { type: 'stealth' });
        if (page.ok) {
            await upsertOpportunity(ctx.db, ctx.run, {
                company_name: 'Industrial Lead',
                role_title: `Renewable Op: ${q.slice(0, 30)}`,
                target_sector: trackName,
                metro_hub: 'Multi-Hub',
                source_url: `https://discovery.industrial/${crypto.randomUUID()}`,
                raw_job_payload: JSON.stringify({ query: q, timestamp: new Date().toISOString() }),
                scan_session_id: ctx.sessionId,
                source_channel: 'track_scanner'
            });
        }
    }

    return { trackName, delta_t };
}
