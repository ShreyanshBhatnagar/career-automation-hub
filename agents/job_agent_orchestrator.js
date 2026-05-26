/**
 * JobAgentOrchestrator V4 — 3-Agent Adversarial Execution Loop
 *
 * Agent A (The Sourcer):   Maps atomic skill nodes from brother_profile.json
 *                          to the incoming opportunity record.
 * Agent B (The Challenger): Strict recruiter persona. Finds every real reason
 *                           the candidate gets rejected — industry delta, tool
 *                           gaps, sector mismatch.
 * Agent C (The Tailor):    Brother-Agent. Neutralizes every critique with a
 *                          dynamic markdown module. Generates Bridge Cards for
 *                          missing skills and writes the final pitch to SQLite.
 *
 * Output shape:
 * {
 *   id, role, company,
 *   agent_a: { matched_nodes, matched_technical_nodes, coverage_score },
 *   agent_b: { critiques: [{ type, detail, severity }] },
 *   agent_c: { modules: [...], bridge_cards: [...], tailored_pitch (markdown) },
 *   db_write_status,
 *   loop_verdict
 * }
 */

import fs from 'fs';
import path from 'path';
import { run, all } from '../database/db.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILE_PATH = path.resolve('./docs/brother_profile.json');

// Vibe constraints loaded from .kiro/.kiro/vibe.json
const VIBE = {
  blacklist: ['delve', 'testament', 'supercharge', 'revolutionary',
              'here is a summary', 'impeccable', 'immaculate'],
  brother_style: 'Direct, supportive, highly technical, unfiltered field vocabulary',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadProfile() {
  return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8'));
}

/** Sanitise output against vibe blacklist */
function sanitise(text) {
  let out = text;
  for (const word of VIBE.blacklist) {
    out = out.replace(new RegExp(word, 'gi'), '[REDACTED]');
  }
  return out;
}

/** Normalise a block of text for keyword matching */
function norm(text = '') {
  return text.toLowerCase();
}

// ─── Agent A: The Sourcer ─────────────────────────────────────────────────────

/**
 * Maps every atomic skill node and technical node from the profile against
 * the opportunity's role title, description, and requirements.
 *
 * Returns:
 * {
 *   matched_nodes:           [{ node, matched_skills, matched_sectors }],
 *   matched_technical_nodes: string[],
 *   unmatched_nodes:         string[],
 *   missing_technical_nodes: string[],
 *   coverage_score:          0–1  (matched leverage nodes / total nodes)
 * }
 */
function agentA_Sourcer(opp, profile) {
  const corpus = norm(`${opp.role_title} ${opp.description} ${opp.requirements}`);

  const matched_nodes = [];
  const unmatched_nodes = [];

  for (const lp of profile.leverage_points) {
    const matchedSkills = lp.atomic_skills.filter(s => corpus.includes(norm(s)));
    const matchedSectors = lp.transferable_leverage.filter(s => corpus.includes(norm(s)));

    if (matchedSkills.length > 0 || matchedSectors.length > 0) {
      matched_nodes.push({
        node: lp.node,
        matched_skills: matchedSkills,
        matched_sectors: matchedSectors,
      });
    } else {
      unmatched_nodes.push(lp.node);
    }
  }

  const matched_technical_nodes = profile.technical_nodes.filter(t =>
    corpus.includes(norm(t))
  );
  const missing_technical_nodes = profile.technical_nodes.filter(t =>
    !corpus.includes(norm(t))
  );

  const coverage_score = parseFloat(
    (matched_nodes.length / profile.leverage_points.length).toFixed(2)
  );

  return {
    matched_nodes,
    unmatched_nodes,
    matched_technical_nodes,
    missing_technical_nodes,
    coverage_score,
  };
}

// ─── Agent B: The Challenger ──────────────────────────────────────────────────

/**
 * Strict recruiter persona. Analyses the opportunity and the Sourcer's output
 * to surface every real rejection risk.
 *
 * Critique shape: { type, detail, severity: 'HIGH' | 'MEDIUM' | 'LOW' }
 *
 * Critique types:
 *   SECTOR_MISMATCH    — industry is too far from candidate's hard-asset base
 *   TOOL_DELTA         — specific tool/platform mentioned in JD is absent
 *   SCALE_MISMATCH     — scope of role doesn't match candidate's scale
 *   COVERAGE_GAP       — low structural overlap from Sourcer
 *   DOMAIN_LANGUAGE    — JD uses domain vocabulary the profile doesn't surface
 */
function agentB_Challenger(opp, sourcerResult, profile) {
  const corpus = norm(`${opp.role_title} ${opp.description} ${opp.requirements}`);
  const critiques = [];

  // ── Sector mismatch ──────────────────────────────────────────────────────
  const hardAssetKeywords = [
    'industrial', 'infrastructure', 'energy', 'site', 'plant', 'power',
    'construction', 'field', 'utility', 'foundry', 'manufacturing',
  ];
  const softSectorKeywords = [
    'digital product', 'consumer', 'saas', 'e-commerce', 'fintech',
    'social media', 'gaming', 'retail',
  ];

  const hasHardAsset = hardAssetKeywords.some(k => corpus.includes(k));
  const hasSoftSector = softSectorKeywords.some(k => corpus.includes(k));

  if (!hasHardAsset) {
    critiques.push({
      type: 'SECTOR_MISMATCH',
      detail: 'Role shows no hard-asset or field-operational language. Recruiter will flag the candidate as over-indexed on industrial execution for this context.',
      severity: 'HIGH',
    });
  }
  if (hasSoftSector) {
    critiques.push({
      type: 'SECTOR_MISMATCH',
      detail: `Role is anchored in digital/consumer space (detected: ${softSectorKeywords.filter(k => corpus.includes(k)).join(', ')}). Candidate's field-ops background reads as irrelevant without explicit translation.`,
      severity: 'HIGH',
    });
  }

  // ── Tool delta ────────────────────────────────────────────────────────────
  const jdToolPatterns = [
    { keyword: 'python',       label: 'Python scripting' },
    { keyword: 'aws',          label: 'AWS cloud platform' },
    { keyword: 'azure',        label: 'Azure cloud platform' },
    { keyword: 'jira',         label: 'Jira project tracking' },
    { keyword: 'autocad',      label: 'AutoCAD design tooling' },
    { keyword: 'primavera',    label: 'Primavera P6 scheduling' },
    { keyword: 'ms project',   label: 'MS Project scheduling' },
    { keyword: 'revit',        label: 'Revit BIM tooling' },
    { keyword: 'scrum',        label: 'Scrum/Agile methodology' },
    { keyword: 'six sigma',    label: 'Six Sigma process framework' },
    { keyword: 'iso 9001',     label: 'ISO 9001 quality standard' },
    { keyword: 'pmp',          label: 'PMP certification' },
  ];

  const profileToolCorpus = norm(
    [...profile.technical_nodes, ...profile.leverage_points.flatMap(lp => lp.atomic_skills)].join(' ')
  );

  for (const tool of jdToolPatterns) {
    if (corpus.includes(tool.keyword) && !profileToolCorpus.includes(tool.keyword)) {
      critiques.push({
        type: 'TOOL_DELTA',
        detail: `JD explicitly requires ${tool.label}. This tool is absent from the candidate's documented profile. ATS will likely filter this out.`,
        severity: 'HIGH',
        missing_tool: tool.label,
        keyword: tool.keyword,
      });
    }
  }

  // ── Coverage gap ──────────────────────────────────────────────────────────
  if (sourcerResult.coverage_score < 0.34) {
    critiques.push({
      type: 'COVERAGE_GAP',
      detail: `Structural overlap is critically low (${sourcerResult.coverage_score * 100}%). Less than one-third of the candidate's leverage nodes map to this role. Recruiter sees a weak fit signal.`,
      severity: 'HIGH',
    });
  } else if (sourcerResult.coverage_score < 0.67) {
    critiques.push({
      type: 'COVERAGE_GAP',
      detail: `Partial structural overlap (${sourcerResult.coverage_score * 100}%). Recruiter will question depth of fit. Unmatched nodes: ${sourcerResult.unmatched_nodes.join(', ')}.`,
      severity: 'MEDIUM',
    });
  }

  // ── Scale mismatch ────────────────────────────────────────────────────────
  const smallScaleKeywords = ['startup', 'early-stage', 'seed', 'series a', 'small team'];
  if (smallScaleKeywords.some(k => corpus.includes(k))) {
    critiques.push({
      type: 'SCALE_MISMATCH',
      detail: 'Role is at startup/early-stage scale. Candidate\'s 50+ contractor management and mega-site execution may read as overqualified or misaligned with lean team dynamics.',
      severity: 'MEDIUM',
    });
  }

  // ── Domain language gap ───────────────────────────────────────────────────
  const domainTerms = [
    'p&l ownership', 'budget ownership', 'go-to-market', 'product roadmap',
    'customer success', 'revenue growth', 'b2b sales',
  ];
  const missingDomainTerms = domainTerms.filter(t => corpus.includes(t) && !profileToolCorpus.includes(t));
  if (missingDomainTerms.length > 0) {
    critiques.push({
      type: 'DOMAIN_LANGUAGE',
      detail: `JD uses commercial/product vocabulary (${missingDomainTerms.join(', ')}) that the profile doesn't surface. Recruiter won't see the translation without explicit framing.`,
      severity: 'MEDIUM',
      missing_terms: missingDomainTerms,
    });
  }

  return { critiques };
}

// ─── Agent C: The Tailor (Brother-Agent) ──────────────────────────────────────

/**
 * Neutralises every Challenger critique with a targeted markdown module.
 * For TOOL_DELTA critiques, generates a Bridge Card with:
 *   - Operational logic mapping (how existing skills cover the gap)
 *   - Direct brother-to-brother message with a 2-day learning path
 *
 * Returns:
 * {
 *   modules:       [{ critique_type, markdown }],
 *   bridge_cards:  [{ missing_tool, operational_mapping, brother_note, markdown }],
 *   tailored_pitch: string  (full markdown, ready for DB write)
 * }
 */
function agentC_Tailor(opp, sourcerResult, challengerResult, profile) {
  const modules = [];
  const bridge_cards = [];

  // ── Neutralise each critique ──────────────────────────────────────────────
  for (const critique of challengerResult.critiques) {

    if (critique.type === 'SECTOR_MISMATCH') {
      const primaryNode = sourcerResult.matched_nodes[0] || profile.leverage_points[0];
      const md = sanitise(`
## Sector Translation: Hard-Asset Execution → ${opp.sector || 'Target Sector'}

The operational logic is identical. Managing a 50+ contractor workforce on a live industrial site — tracking parallel workstreams, enforcing compliance gates, reconciling vendor deliverables under CAPEX pressure — is the same execution muscle this role needs, just applied to a different asset class.

**Mapped leverage:** ${primaryNode.node}
**Transferable sectors already documented:** ${profile.leverage_points.flatMap(lp => lp.transferable_leverage).join(', ')}

The field vocabulary changes. The execution framework does not.
      `.trim());
      modules.push({ critique_type: 'SECTOR_MISMATCH', markdown: md });
    }

    if (critique.type === 'COVERAGE_GAP') {
      const unmatched = sourcerResult.unmatched_nodes;
      const md = sanitise(`
## Coverage Gap Response: Unmatched Nodes — ${unmatched.join(', ')}

These nodes don't surface in the JD's explicit language, but the underlying operational logic is present. ${unmatched[0] || 'The unmatched node'} maps directly to the project governance and vendor control requirements embedded in this role's day-to-day scope.

**Coverage score:** ${sourcerResult.coverage_score * 100}% explicit match — the remaining overlap is implicit and addressed in the pitch framing below.
      `.trim());
      modules.push({ critique_type: 'COVERAGE_GAP', markdown: md });
    }

    if (critique.type === 'SCALE_MISMATCH') {
      const md = sanitise(`
## Scale Calibration Note

Candidate's background is large-scale by default. For this role, the pitch anchors on the *methodology*, not the headcount. Managing 50 contractors builds the same coordination muscle as managing 5 — the difference is the candidate has already stress-tested it at the hard end.
      `.trim());
      modules.push({ critique_type: 'SCALE_MISMATCH', markdown: md });
    }

    if (critique.type === 'DOMAIN_LANGUAGE') {
      const terms = critique.missing_terms || [];
      const md = sanitise(`
## Domain Language Bridge: ${terms.join(', ')}

${terms.map(t => `- **${t}**: Directly maps to ${_mapDomainTerm(t, profile)}`).join('\n')}
      `.trim());
      modules.push({ critique_type: 'DOMAIN_LANGUAGE', markdown: md });
    }

    if (critique.type === 'TOOL_DELTA') {
      const card = _buildBridgeCard(critique, profile, opp);
      bridge_cards.push(card);
      modules.push({ critique_type: 'TOOL_DELTA', markdown: card.markdown });
    }
  }

  // ── Assemble the full tailored pitch ──────────────────────────────────────
  const pitchHeader = sanitise(`
# Tailored Application: ${opp.role_title} @ ${opp.company_name || 'Target Company'}

**Structural Overlap Score:** ${sourcerResult.coverage_score * 100}%
**Matched Leverage Nodes:** ${sourcerResult.matched_nodes.map(n => n.node).join(', ') || 'None detected — see bridge cards'}
**Matched Technical Stack:** ${sourcerResult.matched_technical_nodes.join(', ') || 'None detected'}

---
  `.trim());

  const pitchCore = sanitise(`
## Core Value Proposition

I bring ${profile.leverage_points[0].node} at industrial scale — specifically ${profile.leverage_points[0].atomic_skills[0]} and ${profile.leverage_points[0].atomic_skills[2]} across live field environments. The Ramgarh and Jaisalmer plant contexts are direct proof-of-execution for the operational demands this role carries.

My edge is the translation layer: I operate at the intersection of field reality and commercial control. That means vendor reconciliation doesn't slip, CAPEX margins hold, and site governance doesn't require a second layer of management to function.
  `.trim());

  const neutralisationBlock = modules.length > 0
    ? `\n\n---\n\n## Adversarial Neutralisation Modules\n\n${modules.map(m => m.markdown).join('\n\n---\n\n')}`
    : '';

  const bridgeBlock = bridge_cards.length > 0
    ? `\n\n---\n\n## Bridge Cards — Skill Gap Mapping\n\n${bridge_cards.map(c => c.markdown).join('\n\n---\n\n')}`
    : '';

  const tailored_pitch = `${pitchHeader}\n\n${pitchCore}${neutralisationBlock}${bridgeBlock}`;

  return { modules, bridge_cards, tailored_pitch };
}

// ─── Bridge Card Builder ──────────────────────────────────────────────────────

/**
 * Builds a Bridge Card for a single TOOL_DELTA critique.
 * Includes operational logic mapping + direct brother note with 2-day path.
 */
function _buildBridgeCard(critique, profile, opp) {
  const tool = critique.missing_tool;
  const keyword = critique.keyword;

  const operationalMapping = _mapToolToProfile(keyword, profile);
  const learningPath = _getLearningPath(keyword);

  const brother_note = `Bro, you need to cross-reference or learn ${tool} in 2 days. Here is how we map it for the ATS right now: ${operationalMapping.ats_framing}`;

  const markdown = sanitise(`
### Bridge Card: ${tool}

**Gap identified by Challenger:** ${critique.detail}

**Operational Logic Mapping:**
${operationalMapping.narrative}

**ATS Framing (use this exact language in your application):**
> ${operationalMapping.ats_framing}

**Adjacent skills already in your profile that cover this:**
${operationalMapping.adjacent_skills.map(s => `- ${s}`).join('\n')}

---
> **${brother_note}**
>
> **2-Day Learning Path:**
${learningPath.map((step, i) => `> ${i + 1}. ${step}`).join('\n')}
  `.trim());

  return { missing_tool: tool, operational_mapping: operationalMapping, brother_note, markdown };
}

/** Maps a detected tool keyword to adjacent profile skills and ATS framing */
function _mapToolToProfile(keyword, profile) {
  const allSkills = profile.leverage_points.flatMap(lp => lp.atomic_skills);
  const allTech = profile.technical_nodes;

  const mappings = {
    python: {
      narrative: 'Python is used for data processing and automation. Your SAP ERP operational control and site reconciliation work involves the same structured data logic — you\'ve been doing this manually or through ERP interfaces. Python just exposes the same layer programmatically.',
      ats_framing: 'Proficient in structured data workflows and operational automation; actively building Python scripting capability to extend existing SAP/ERP data control experience.',
      adjacent_skills: allSkills.filter(s => s.toLowerCase().includes('sap') || s.toLowerCase().includes('erp')),
    },
    aws: {
      narrative: 'AWS cloud infrastructure management maps directly to your large-scale resource allocation and vendor governance experience. The control plane is different; the governance logic is identical.',
      ats_framing: 'Experienced in large-scale resource governance and infrastructure operations; applying cloud platform fundamentals (AWS) to extend existing operational control frameworks.',
      adjacent_skills: allSkills.filter(s => s.toLowerCase().includes('resource') || s.toLowerCase().includes('governance')),
    },
    azure: {
      narrative: 'Azure is Microsoft\'s cloud stack. Your SAP ERP background gives you the enterprise integration mindset. Azure is the next layer of the same enterprise control plane.',
      ats_framing: 'Enterprise systems background (SAP ERP) provides direct foundation for Azure enterprise integration and resource management.',
      adjacent_skills: allTech.filter(t => t.toLowerCase().includes('sap')),
    },
    jira: {
      narrative: 'Jira is a project tracking tool. You\'ve been tracking multi-vendor workstreams, service orders, and site milestones at scale. Jira is a UI layer on top of the same workflow logic.',
      ats_framing: 'Managed complex multi-vendor project tracking and milestone governance at industrial scale; Jira adoption is a direct extension of existing workflow management practice.',
      adjacent_skills: ['Service Order Governance', 'Large-Scale Resource Allocation'],
    },
    primavera: {
      narrative: 'Primavera P6 is the scheduling tool for large capital projects. Your mega-solar site execution and CAPEX margin protection work is exactly the domain P6 is built for.',
      ats_framing: 'Executed large-scale capital project scheduling and resource sequencing in field environments; Primavera P6 is the formal tooling layer for this existing capability.',
      adjacent_skills: ['Mega-Solar Site Execution', 'CAPEX Margin Protection'],
    },
    'ms project': {
      narrative: 'MS Project is a scheduling tool. Your site execution background covers the same planning logic — critical path, resource levelling, milestone tracking.',
      ats_framing: 'Experienced in critical path management and resource scheduling for complex field projects; MS Project formalises existing planning methodology.',
      adjacent_skills: allSkills.filter(s => s.toLowerCase().includes('resource') || s.toLowerCase().includes('site')),
    },
    scrum: {
      narrative: 'Scrum is an iterative delivery framework. Your on-site crisis resolution and parallel workstream management is the field equivalent — short cycles, rapid re-prioritisation, direct team communication.',
      ats_framing: 'Applied iterative project management and rapid re-prioritisation in high-stakes field environments; Scrum methodology formalises this existing execution pattern.',
      adjacent_skills: ['On-site Crisis Resolution', 'Remote Plant Management (Jaisalmer/Ramgarh context)'],
    },
    'six sigma': {
      narrative: 'Six Sigma is a process optimisation framework. Your structural safety compliance and site reconciliation work is process-driven by nature — you\'ve been doing DMAIC without the certification label.',
      ats_framing: 'Applied systematic process control and variance reduction in industrial field operations; Six Sigma methodology aligns directly with existing compliance and reconciliation practice.',
      adjacent_skills: ['Structural Safety Compliance', 'Site Reconciliation'],
    },
    pmp: {
      narrative: 'PMP is a project management certification. Your field execution record across mega-solar and industrial sites is the practical equivalent. The certification is a documentation exercise on top of what you\'ve already done.',
      ats_framing: 'Demonstrated project management capability across large-scale industrial implementations; PMP certification formalises existing field execution methodology.',
      adjacent_skills: allSkills,
    },
  };

  return mappings[keyword] || {
    narrative: `${keyword} is a tool/framework in this domain. Your operational background provides the foundational logic; the specific tool is an interface layer.`,
    ats_framing: `Operational background provides direct foundation for ${keyword} adoption; actively building platform-specific proficiency.`,
    adjacent_skills: allSkills.slice(0, 3),
  };
}

/** Returns a 2-day learning path for a given tool keyword */
function _getLearningPath(keyword) {
  const paths = {
    python: [
      'Day 1 AM: Python basics + data structures (freeCodeCamp Python course, first 3 hours)',
      'Day 1 PM: Write a script that reads a CSV and filters rows — mirrors your SAP data export workflow',
      'Day 2 AM: pandas basics — read, filter, export. This is your ERP data layer in code',
      'Day 2 PM: Push one working script to GitHub. That\'s your proof-of-work for the ATS',
    ],
    aws: [
      'Day 1: AWS Cloud Practitioner Essentials (free, 6 hours) — focus on EC2, S3, IAM',
      'Day 1 PM: Map AWS resource governance to your vendor management mental model',
      'Day 2: AWS free tier — spin up one EC2 instance, configure a security group',
      'Day 2 PM: Document it as "cloud infrastructure provisioning" in your profile',
    ],
    jira: [
      'Day 1: Jira free tier — create a project, add tasks, set up a sprint board (2 hours max)',
      'Day 1 PM: Recreate one of your site workstream structures in Jira',
      'Day 2: Jira Atlassian certification (free, 1 hour) — adds a credential line',
      'Day 2 PM: Screenshot your board, reference it as "Agile project tracking" in applications',
    ],
    primavera: [
      'Day 1: Oracle Primavera P6 free trial — load a sample project, map your Ramgarh site timeline into it',
      'Day 1 PM: Focus on WBS structure and resource assignment — you already know the logic',
      'Day 2: Export a baseline schedule PDF — this is your proof artifact',
      'Day 2 PM: Add "Primavera P6 scheduling" to your technical stack with the artifact as evidence',
    ],
    scrum: [
      'Day 1: Scrum Guide (free, 1 hour read) — map every Scrum ceremony to your field equivalent',
      'Day 1 PM: Scrum.org free assessment — understand the vocabulary',
      'Day 2: Professional Scrum Master I (PSM I) — $150, same-day result, globally recognised',
      'Day 2 PM: Frame your site sprint cycles in Scrum language in your profile',
    ],
    pmp: [
      'Day 1: PMI PMP exam outline — map your project experience to the PMBOK process groups',
      'Day 1 PM: Document 3 projects with scope, schedule, cost, and stakeholder data in PMI format',
      'Day 2: CAPM (entry-level PMP) — faster path if PMP eligibility hours aren\'t documented yet',
      'Day 2 PM: Apply for PMP eligibility — your field hours almost certainly qualify',
    ],
  };

  return paths[keyword] || [
    `Day 1: Find the official documentation or free course for ${keyword} — spend 3 focused hours`,
    `Day 1 PM: Map one concept from ${keyword} to something you already do operationally`,
    `Day 2: Build one small proof-of-work artifact using ${keyword}`,
    `Day 2 PM: Add it to your profile with the operational mapping as context`,
  ];
}

/** Maps commercial/product domain terms to profile equivalents */
function _mapDomainTerm(term, profile) {
  const map = {
    'p&l ownership': 'CAPEX Margin Protection and Industrial Vendor Negotiation — you\'ve owned the cost line on live projects',
    'budget ownership': 'CAPEX Margin Protection across multi-vendor site operations',
    'go-to-market': 'project mobilisation and vendor onboarding at scale — same sequencing logic',
    'product roadmap': 'site execution phasing and milestone governance',
    'customer success': 'client-side project delivery and stakeholder management in field environments',
    'revenue growth': 'CAPEX efficiency and margin protection — the industrial equivalent of revenue impact',
    'b2b sales': 'Industrial Vendor Negotiation and Service Order Governance — commercial relationship management at scale',
  };
  return map[term] || `existing operational governance experience in ${profile.leverage_points[0].node}`;
}

// ─── Orchestrator Class ───────────────────────────────────────────────────────

class JobAgentOrchestrator {
  /**
   * @param {object} config
   * @param {import('sqlite3').Database} config.db  — open SQLite db instance
   */
  constructor(config = {}) {
    this.db = config.db || null;
  }

  /**
   * Run the full 3-agent adversarial loop for a single opportunity.
   *
   * @param {number|string} oppId  — opportunities.id in SQLite
   * @returns {Promise<object>}    — structured JSON result (see file header)
   */
  async processOpportunity(oppId) {
    console.log(`\n[Orchestrator V4] ── Adversarial Loop START — Opportunity #${oppId} ──`);

    const profile = loadProfile();
    const opp = await this._fetchOpportunity(oppId);

    if (!opp) {
      throw new Error(`Opportunity #${oppId} not found in database.`);
    }

    // ── Agent A ──────────────────────────────────────────────────────────────
    console.log('[Agent A | Sourcer] Mapping atomic skill nodes...');
    const sourcerResult = agentA_Sourcer(opp, profile);
    console.log(`[Agent A] Coverage: ${sourcerResult.coverage_score * 100}% | Matched nodes: ${sourcerResult.matched_nodes.map(n => n.node).join(', ') || 'none'}`);

    // ── Agent B ──────────────────────────────────────────────────────────────
    console.log('[Agent B | Challenger] Running rejection analysis...');
    const challengerResult = agentB_Challenger(opp, sourcerResult, profile);
    console.log(`[Agent B] ${challengerResult.critiques.length} critique(s) raised:`);
    challengerResult.critiques.forEach(c => console.log(`  [${c.severity}] ${c.type}: ${c.detail.slice(0, 80)}...`));

    // ── Agent C ──────────────────────────────────────────────────────────────
    console.log('[Agent C | Tailor] Neutralising critiques and building pitch...');
    const tailorResult = agentC_Tailor(opp, sourcerResult, challengerResult, profile);
    console.log(`[Agent C] ${tailorResult.modules.length} module(s) built | ${tailorResult.bridge_cards.length} bridge card(s) generated`);

    // ── DB Write ─────────────────────────────────────────────────────────────
    let db_write_status = 'skipped — no db connection';
    if (this.db) {
      try {
        await run(
          this.db,
          `UPDATE opportunities SET tailored_pitch = ?, status = ? WHERE id = ?`,
          [tailorResult.tailored_pitch, 'Reviewed', oppId]
        );
        db_write_status = `written — ${tailorResult.tailored_pitch.length} chars to tailored_pitch`;
        console.log(`[DB] tailored_pitch written for opportunity #${oppId}`);
      } catch (err) {
        db_write_status = `error — ${err.message}`;
        console.error(`[DB] Write failed: ${err.message}`);
      }
    }

    // ── Loop verdict ─────────────────────────────────────────────────────────
    const highCritiques = challengerResult.critiques.filter(c => c.severity === 'HIGH').length;
    const loop_verdict = highCritiques === 0
      ? 'STRONG FIT — Apply immediately'
      : highCritiques <= 1
        ? 'VIABLE — Apply with bridge cards active'
        : 'STRETCH — Apply only if pipeline is thin; bridge cards are essential';

    console.log(`[Orchestrator V4] ── Loop COMPLETE — Verdict: ${loop_verdict} ──\n`);

    return {
      id: oppId,
      role: opp.role_title,
      company: opp.company_name,
      agent_a: sourcerResult,
      agent_b: challengerResult,
      agent_c: {
        modules: tailorResult.modules,
        bridge_cards: tailorResult.bridge_cards,
        tailored_pitch: tailorResult.tailored_pitch,
      },
      db_write_status,
      loop_verdict,
    };
  }

  /**
   * Fetch a single opportunity row from SQLite.
   * Falls back to a mock record if no db is connected (dev/test mode).
   */
  async _fetchOpportunity(id) {
    if (this.db) {
      const rows = await all(this.db, `SELECT * FROM opportunities WHERE id = ?`, [id]);
      return rows[0] || null;
    }

    // ── Mock record for local dev ─────────────────────────────────────────
    console.warn('[Orchestrator] No DB connected — using mock opportunity record.');
    return {
      id,
      company_name: 'Nexus Energy Systems',
      role_title: 'Project Lead — Data Center Power Infrastructure',
      description: 'Oversee implementation of high-voltage power systems for a new campus. Requires vendor reconciliation, resource allocation, and field site management. Primavera P6 scheduling experience preferred. Python scripting for reporting automation is a plus.',
      requirements: '10+ years in industrial operations or energy infrastructure. PMP preferred. Experience with Jira for project tracking.',
      sector: 'Data Center Infrastructure',
    };
  }
}

export default JobAgentOrchestrator;
