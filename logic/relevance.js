import fs from 'fs';
import path from 'path';

function getProfile() {
  const profilePath = path.resolve('./docs/brother_profile.json');
  return JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
}

/**
 * V3.2 Non-Linear Multi-Criteria Scoring Engine
 */
export function scoreOpportunity({ role_title = '', notes = '', description = '', requirements = '', sector = '', location = '', company_name = '' }) {
  const profile = getProfile();
  const text = `${role_title} ${notes} ${description} ${requirements} ${sector} ${location} ${company_name}`.toLowerCase();

  // 1. Data Prep
  const techNodes = (profile.technical_nodes || []).map(s => s.toLowerCase());
  const leveragePoints = (profile.leverage_points || []);
  const allAtomicSkills = leveragePoints.flatMap(p => p.atomic_skills).map(s => s.toLowerCase());
  const allTransferable = leveragePoints.flatMap(p => p.transferable_leverage).map(s => s.toLowerCase());
  const targetSectors = (profile.target_arbitrage_sectors || []).map(s => s.toLowerCase());

  let rawScore = 0.05; // Base floor
  const reasons = [];

  // 2. Base Matching (Geometric Accumulation)
  // We use a diminishing returns approach for base keywords
  const techMatches = techNodes.filter(k => text.includes(k.toLowerCase()));
  if (techMatches.length > 0) {
    rawScore += 0.25 * Math.pow(1.2, techMatches.length - 1);
    reasons.push(`nodes:${techMatches.length}`);
  }

  const atomicMatches = allAtomicSkills.filter(k => text.includes(k));
  if (atomicMatches.length > 0) {
    rawScore += 0.25 * Math.pow(1.15, atomicMatches.length - 1);
    reasons.push(`atomic:${atomicMatches.length}`);
  }

  const arbitrageMatches = allTransferable.filter(k => text.includes(k));
  if (arbitrageMatches.length > 0) {
    rawScore += 0.3 * Math.pow(1.1, arbitrageMatches.length - 1);
    reasons.push(`arbitrage:${arbitrageMatches.length}`);
  }

  // 3. HARD GATES (Exponential Multipliers)
  // Core technical tools provide a massive boost
  let multiplier = 1.0;
  const coreTools = ['pscad', 'etap', 'matlab', 'sap'];
  const toolMatches = coreTools.filter(t => text.includes(t));
  if (toolMatches.length > 0) {
    multiplier *= Math.pow(1.4, toolMatches.length);
    reasons.push(`gate:tools(${toolMatches.join(',')})`);
  }

  // 4. SCALE BONUS
  const scaleKeywords = ['large team', '50+', 'contractor', 'vendor management', 'multi-site', 'mega-scale', 'foundry', 'infrastructure'];
  const scaleMatches = scaleKeywords.filter(k => text.includes(k));
  if (scaleMatches.length > 0) {
    multiplier *= 1.25;
    reasons.push('bonus:scale');
  }

  // 5. PROXIMITY DECAY
  const industrialContext = ['plant', 'site', 'factory', 'grid', 'power', 'field', 'construction', 'operational', 'hard asset'];
  const hasIndustrialContext = industrialContext.some(k => text.includes(k));
  if (!hasIndustrialContext) {
    multiplier *= 0.6; // Heavy penalty for pure "digital" roles
    reasons.push('decay:no_industrial_context');
  }

  // 6. Final Calculation & Non-Linear Normalization (Sigmoid-like)
  let finalScore = rawScore * multiplier;

  // Normalize using a simple non-linear squash (tanh-like approach for 0-1 range)
  // Ensures scores don't just stay at 0.4 but "break out" if multiple criteria are met
  const normalized = Math.min(1.0, (2 / (1 + Math.exp(-2.5 * finalScore))) - 1);

  return {
    relevance_score: Math.round(normalized * 100) / 100,
    is_offbeat: /tender|mnre|hidden|signal|referral/i.test(text) ? 1 : 0,
    match_reasons: reasons,
  };
}

export function matchesRoleKeywords(text) {
  const profile = getProfile();
  const techNodes = (profile.technical_nodes || []).map(s => s.toLowerCase());
  const leveragePoints = (profile.leverage_points || []);
  const allAtomicSkills = leveragePoints.flatMap(p => p.atomic_skills).map(s => s.toLowerCase());

  const t = text.toLowerCase();
  const keys = [
    ...techNodes, ...allAtomicSkills, 'engineer', 'manager', 'operations', 'plant', 'foundry',
    'infrastructure', 'automation', 'commissioning', 'epc',
  ];
  return keys.some((k) => t.includes(k));
}
