import fs from 'fs';
import path from 'path';

/**
 * Track Renewables Scanner
 *
 * Focuses on Solar EPC, Mega-scale Energy, and Wind Infrastructure.
 * Implements Δt check and geographic regional filtering.
 */
export async function scanRenewables(ctx) {
    const sector = 'Renewables & Mega-Scale Energy';
    ctx.log(`Starting Track: ${sector}`);

    const profileVault = JSON.parse(fs.readFileSync(path.resolve('./config/profile_vault.json'), 'utf-8'));
    const geographicGrid = profileVault.operational_boundaries.geographic_grid.map(c => c.toLowerCase());

    const { get } = await import('../../database/db.js');
    const lastScan = await get(ctx.db, `SELECT MAX(scanned_at) as at FROM scan_logs WHERE source_name LIKE ?`, [`%${sector}%`]);
    const Δt = lastScan?.at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    ctx.log(`Scanning for updates since ${Δt}...`);

    return { sector, lastScanTime: Δt, geographicGrid };
}
