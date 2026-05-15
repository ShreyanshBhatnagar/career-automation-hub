import fs from 'fs';
import path from 'path';

const profilePath = path.resolve('./docs/brother_profile.json');
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

const TECH = [
  'pscad', 'matlab', 'autocad', 'power system', 'protection', 'switchgear',
  'solar', 'substation', 'sld', 'commissioning', 'renewable', 'grid',
];
const COMMERCIAL = [
  'contract', 'sap', 'billing', 'boq', 'vendor', 'project controls',
  'cost manager', 'service order', 'ld', 'closure',
];
const LOCATIONS = (profile.locations || []).map((l) => l.toLowerCase());
const SECTORS = (profile.target_sectors || []).map((s) => s.toLowerCase());
const TARGET_ROLES = (profile.target_roles || []).map((r) => r.toLowerCase());

export function scoreOpportunity({ role_title = '', notes = '', sector = '', location = '', company_name = '' }) {
  const text = `${role_title} ${notes} ${sector} ${location} ${company_name}`.toLowerCase();
  let score = 0.15;
  const reasons = [];

  if (TECH.some((k) => text.includes(k))) {
    score += 0.3;
    reasons.push('technical_match');
  }
  if (COMMERCIAL.some((k) => text.includes(k))) {
    score += 0.3;
    reasons.push('commercial_match');
  }
  if (LOCATIONS.some((l) => text.includes(l)) || /gujarat|ahmedabad|vadodara/i.test(text)) {
    score += 0.2;
    reasons.push('location_match');
  }
  if (SECTORS.some((s) => text.includes(s.split(' ')[0]))) {
    score += 0.15;
    reasons.push('sector_match');
  }
  if (TARGET_ROLES.some((r) => text.includes(r.split('/')[0].trim().slice(0, 12)))) {
    score += 0.1;
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
  const t = text.toLowerCase();
  const keys = [
    ...TECH, ...COMMERCIAL, 'engineer', 'manager', 'coordinator', 'administrator',
    'consultant', 'hiring', 'vacancy', 'opening', 'commissioning', 'epc',
  ];
  return keys.some((k) => t.includes(k));
}
