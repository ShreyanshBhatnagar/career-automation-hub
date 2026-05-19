import fs from 'fs';
import path from 'path';

function getProfile() {
  const profilePath = path.resolve('./docs/brother_profile.json');
  return JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
}

export function scoreOpportunity({ role_title = '', notes = '', description = '', requirements = '', sector = '', location = '', company_name = '' }) {
  const profile = getProfile();
  const techSkills = (profile.technical_skills || []).map(s => s.split('(')[0].trim().toLowerCase());
  const commSkills = (profile.commercial_skills || []).map(s => s.split('(')[0].trim().toLowerCase());
  const locations = (profile.locations || []).map(l => l.toLowerCase());
  const sectors = (profile.target_sectors || []).map(s => s.toLowerCase());
  const targetRoles = (profile.target_roles || []).map(r => r.toLowerCase());

  const text = `${role_title} ${notes} ${description} ${requirements} ${sector} ${location} ${company_name}`.toLowerCase();
  let score = 0.1;
  const reasons = [];

  const techMatches = techSkills.filter((k) => text.includes(k));
  if (techMatches.length > 0) {
    score += Math.min(0.4, 0.2 + techMatches.length * 0.05);
    reasons.push(`tech:${techMatches[0]}`);
  }

  const commMatches = commSkills.filter((k) => text.includes(k));
  if (commMatches.length > 0) {
    score += Math.min(0.4, 0.2 + commMatches.length * 0.05);
    reasons.push(`comm:${commMatches[0]}`);
  }
  if (locations.some((l) => text.includes(l)) || /gujarat|ahmedabad|vadodara/i.test(text)) {
    score += 0.2;
    reasons.push('location_match');
  }
  if (sectors.some((s) => text.includes(s.split(' ')[0]))) {
    score += 0.15;
    reasons.push('sector_match');
  }
  if (targetRoles.some((r) => text.includes(r.split('/')[0].trim().slice(0, 12)))) {
    const isLeadership = /founder|chief|leadership|lead|manager|head/i.test(text);
    score += isLeadership ? 0.25 : 0.1;
    reasons.push('role_match');
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
