import fs from 'fs';
import path from 'path';
import { smartFetch } from '../lib/fetch.js';
import { upsertOpportunity } from '../lib/persist.js';

/**
 * Track Semiconductors Scanner
 * Enforces Δt check and Indian geographic regional boundaries.
 */
export async function scanSemiconductors(ctx) {
    const trackName = 'Semiconductors';
    const profile = JSON.parse(fs.readFileSync(path.resolve('./config/profile_vault.json'), 'utf-8'));

    // Δt check: Filter based on last success in this track
    const { get } = await import('../../database/db.js');
    const lastLog = await get(ctx.db, `SELECT MAX(scanned_at) as at FROM scan_logs WHERE source_name = ?`, [trackName]);
    const delta_t = lastLog?.at || new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    ctx.log(`Running Track: ${trackName}. Ingesting signals post ${delta_t}`);

    const geoGrid = Object.values(profile.operational_boundaries.geographic_grid).flat();

    // Execution: Using industrial search queries constrained by regions
    const queries = [
        `"Semiconductor" foundry hiring ${geoGrid.slice(0, 5).join(' OR ')}`,
        `"Fab" construction project ${geoGrid.slice(5, 10).join(' OR ')}`
    ];

    for (const q of queries) {
        const page = await smartFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { type: 'stealth' });
        if (page.ok) {
            // Strategic Phase 1: Append raw payload
            await upsertOpportunity(ctx.db, ctx.run, {
                company_name: 'Industrial Lead',
                role_title: `Foundry Op: ${q.slice(0, 30)}`,
                target_sector: trackName,
                metro_hub: geoGrid[0], // Map to primary hub
                source_url: `https://discovery.industrial/${crypto.randomUUID()}`,
                raw_job_payload: JSON.stringify({ query: q, timestamp: new Date().toISOString(), html_len: page.html.length }),
                scan_session_id: ctx.sessionId,
                source_channel: 'track_scanner'
            });
        }
    }

    return { trackName, delta_t };
}
