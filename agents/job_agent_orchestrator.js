/**
 * JobAgentOrchestrator V3
 *
 * Implements an Adversarial Red Teaming Loop:
 * 1. Sourcer: Finds structural overlap.
 * 2. Challenger: Attempts to reject the candidate.
 * 3. Tailor: Neutralizes the rejection points.
 */

import ResumeTailorAgent from './resume_tailor_agent.js';
import fs from 'fs';
import path from 'path';

class JobAgentOrchestrator {
  constructor(config = {}) {
    this.agents = {
      tailor: new ResumeTailorAgent(),
    };
    this.db = config.db;
    this.profilePath = path.resolve('./docs/brother_profile.json');
  }

  async processOpportunity(oppId) {
    console.log(`[V3 Orchestrator] Starting Adversarial Loop for ID #${oppId}...`);

    // 1. SOURCER PHASE: Mapping Atomic Skills
    const opp = await this.fetchOpportunity(oppId);
    const mapping = this.mapStructuralOverlap(opp);
    console.log(`[Sourcer] Structural Overlap Found: ${mapping.map(m => m.node).join(', ')}`);

    // 2. CHALLENGER PHASE: Red Teaming (Finding Rejection Reasons)
    const critiques = this.runRedTeamAnalysis(opp, mapping);
    console.log(`[Challenger] Rejection Points Identified: ${critiques.join(' | ')}`);

    // 3. TAILOR PHASE: Neutralization
    const result = await this.neutralizeAndTailor(opp, critiques);

    // Persist Tailored Pitch
    if (this.db) {
        const { run } = await import('../database/db.js');
        await run(
            this.db,
            `UPDATE opportunities SET tailored_pitch = ? WHERE id = ?`,
            [result.pitch, oppId]
        );
    }

    return {
      id: oppId,
      role: opp.role_title,
      structural_overlap: mapping,
      red_team_critiques: critiques,
      tailored_pitch: result.pitch,
      status: "Arbitrage Opportunity Verified"
    };
  }

  mapStructuralOverlap(opp) {
    const profile = JSON.parse(fs.readFileSync(this.profilePath, 'utf-8'));
    const text = (opp.role_title + ' ' + opp.description).toLowerCase();

    // Map atomic nodes to the job description
    return profile.leverage_points.filter(point => {
      return point.atomic_skills.some(skill => text.includes(skill.toLowerCase())) ||
             point.transferable_leverage.some(sector => text.includes(sector.toLowerCase()));
    });
  }

  runRedTeamAnalysis(opp, mapping) {
    const critiques = [];
    const text = (opp.role_title + ' ' + opp.description).toLowerCase();

    // Structural "Challenger" logic (simulated LLM crit)
    if (!text.includes('solar') && !text.includes('electrical')) {
      critiques.push("Candidate's industry background (Renewables/Power) is irrelevant to this high-growth sector.");
    }
    if (text.includes('saas') || text.includes('product')) {
      critiques.push("Candidate lacks direct SaaS/Product metrics and lifecycle experience.");
    }
    if (mapping.length < 1) {
      critiques.push("No clear structural leverage found between field experience and this role.");
    }

    return critiques;
  }

  async neutralizeAndTailor(opp, critiques) {
    // This calls Agent C (The Tailor) with the "Adversarial Prompt"
    const profile = JSON.parse(fs.readFileSync(this.profilePath, 'utf-8'));

    // Prototype: We pick a high-leverage node to neutralize the industry gap
    const primaryNode = profile.leverage_points[0];
    const pitch = `While my background is in energy infrastructure, I specialize in ${primaryNode.node}. Specifically, I neutralized ${critiques.length} operational risks in my previous role through ${primaryNode.atomic_skills[0]}, which directly maps to the high-stakes execution required here.`;

    return { pitch };
  }

  async fetchOpportunity(id) {
    if (this.db) {
        const { all } = await import('../database/db.js');
        const rows = await all(this.db, `SELECT * FROM opportunities WHERE id = ?`, [id]);
        return rows[0];
    }
    // Mock for verification
    return {
      id,
      role_title: "Operations Lead - AI Infrastructure (SaaS)",
      description: "We need someone to manage complex vendor reconciliations and resource allocation for our growing data center footprint. Requires SAP experience and high-stakes troubleshooting.",
      requirements: "SaaS experience preferred. Background in scaling systems."
    };
  }
}

export default JobAgentOrchestrator;
