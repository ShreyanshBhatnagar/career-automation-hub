import fs from 'fs';
import path from 'path';

function getProfile() {
  const profilePath = path.resolve('./docs/brother_profile.json');
  return JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
}

export function scoreOpportunity({ role_title = '', notes = '', description = '', requirements = '', sector = '', location = '', company_name = '' }) {
  const profile = getProfile();

  // V3 Skill Mapping
  const techNodes = (profile.technical_nodes || []).map(s => s.toLowerCase());
  const leveragePoints = (profile.leverage_points || []);
  const allAtomicSkills = leveragePoints.flatMap(p => p.atomic_skills).map(s => s.toLowerCase());
  const allTransferable = leveragePoints.flatMap(p => p.transferable_leverage).map(s => s.toLowerCase());

  const targetSectors = (profile.target_arbitrage_sectors || []).map(s => s.toLowerCase());

  const text = `${role_title} ${notes} ${description} ${requirements} ${sector} ${location} ${company_name}`.toLowerCase();
  let score = 0.1;
  const reasons = [];

  const techMatches = techNodes.filter((k) => text.includes(k.split(' ')[0]));
  if (techMatches.length > 0) {
    score += Math.min(0.3, 0.1 + techMatches.length * 0.05);
    reasons.push(`node:${techMatches[0]}`);
  }

  const atomicMatches = allAtomicSkills.filter((k) => text.includes(k.toLowerCase()));
  if (atomicMatches.length > 0) {
    score += Math.min(0.4, 0.2 + atomicMatches.length * 0.05);
    reasons.push(`atomic:${atomicMatches[0]}`);
  }

  const transferMatches = allTransferable.filter((k) => text.includes(k.toLowerCase()));
  if (transferMatches.length > 0) {
    score += 0.2;
    reasons.push(`arbitrage:${transferMatches[0]}`);
  }

  if (targetSectors.some((s) => text.includes(s.split(' ')[0]))) {
    score += 0.15;
    reasons.push('sector_match');
  }

  const isLeadership = /founder|chief|leadership|lead|manager|head/i.test(text);
  if (isLeadership) {
    score += 0.15;
    reasons.push('leadership_match');
  }

  const isOffbeat =
    reasons.includes('commercial_match') && reasons.includes('technical_match') ||
    /tender|mnre|commissioning|signal|hidden|referral|dm|instagram|facebook|x\.com|twitter/i.test(text);

  return {
    relevance_score: Math.min(1, Math.round(score * 100) / 100),
    is_offbeat: isOffbeat ? 1 : 0,
    match_reasons: reasons,
  };
}

export function matchesRoleKeywords(text) {
  const profile = getProfile();
  const techSkills = (profile.technical_skills || []).map(s => s.split('(')[0].trim().toLowerCase());
  const commSkills = (profile.commercial_skills || []).map(s => s.split('(')[0].trim().toLowerCase());

  const t = text.toLowerCase();
  const keys = [
    ...techSkills, ...commSkills, 'engineer', 'manager', 'coordinator', 'administrator',
    'consultant', 'hiring', 'vacancy', 'opening', 'commissioning', 'epc',
  ];
  return keys.some((k) => t.includes(k));
}
