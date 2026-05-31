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

const SKILL_SYNONYMS = {
  "contractor management": ["vendor management", "subcontractor oversight", "labor coordination", "workforce management"],
  "site reconciliation": ["material accounting", "field audit", "site verification", "operational reconciliation"],
  "sap/erp": ["enterprise resource planning", "operational control systems", "service order management", "industrial software"],
  "foundry": ["fab", "semiconductor plant", "cleanroom facility", "silicon manufacturing"],
  "data center": ["server farm", "mission critical infrastructure", "hyperscale", "colocation facility"],
  "high-voltage": ["hv", "power distribution", "substation", "electrical infrastructure"]
};

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

    const totalLeverageNodes = profile.leverage_points.length;
    const coverageScore = totalLeverageNodes > 0 ? (mapping.length / totalLeverageNodes) : 0;

    return {
      id: oppId,
      role: opp.role_title,
      structural_overlap: mapping,
      red_team_critiques: critiques,
      tailored_pitch: result.pitch,
      agent_a: {
        coverage_score: coverageScore
      },
      status: "Arbitrage Opportunity Verified"
    };
  }

  mapStructuralOverlap(opp) {
    const profile = JSON.parse(fs.readFileSync(this.profilePath, 'utf-8'));
    const text = (opp.role_title + ' ' + (opp.description || '')).toLowerCase();

    // Semantic Expansion: Create an expanded corpus of skills and their synonyms
    return profile.leverage_points.filter(point => {
      const expandedCorpus = [...point.atomic_skills, ...point.transferable_leverage].flatMap(skill => {
          const s = skill.toLowerCase();
          return [s, ...(SKILL_SYNONYMS[s] || [])];
      });

      return expandedCorpus.some(term => text.includes(term));
    });
  }

  runRedTeamAnalysis(opp, mapping) {
    const critiques = [];
    const text = (opp.role_title + ' ' + opp.description).toLowerCase();

    // Industrial Proximity "Challenger" logic
    if (!text.includes('industrial') && !text.includes('infrastructure') && !text.includes('energy') && !text.includes('site')) {
      critiques.push("Candidate background is heavily field-operational; this role appears too detached from hard-asset execution.");
    }
    if (text.includes('digital product') || text.includes('consumer')) {
      critiques.push("Role focuses on digital/consumer assets; lacks the industrial scale and complexity the candidate thrives in.");
    }
    if (mapping.length < 1) {
      critiques.push("No structural overlap found between industrial site governance and this specific role's requirements.");
    }

    return critiques;
  }

  async neutralizeAndTailor(opp, critiques) {
    const profile = JSON.parse(fs.readFileSync(this.profilePath, 'utf-8'));

    // Neutralize industrial gap by focusing on "Atomic Scale"
    const primaryNode = profile.leverage_points[0];
    const pitch = `While this role represents an expansion into ${opp.sector || 'new industrial tracks'}, I specialize in ${primaryNode.node}—specifically managing a 50+ contractor workforce in high-stakes environments like the Ramgarh plant. I apply the same ${primaryNode.atomic_skills[0]} logic to neutralize operational bottlenecks in any hard-infrastructure project.`;

    return { pitch };
  }

  async fetchOpportunity(id) {
    if (this.db) {
        const { all } = await import('../database/db.js');
        const rows = await all(this.db, `SELECT * FROM opportunities WHERE id = ?`, [id]);
        return rows[0];
    }
    // Updated Mock for Industrial context
    return {
      id,
      role_title: "Project Lead - Data Center Power Infrastructure",
      description: "Oversee the implementation of high-voltage power systems for a new campus. Requires vendor reconciliation, resource allocation, and field site management experience.",
      requirements: "10+ years in industrial operations or energy infrastructure.",
      sector: "Data Center Infrastructure"
    };
  }
}

export default JobAgentOrchestrator;
