import { scoreOpportunity } from './logic/relevance.js';

const opp = {
  role_title: "Operations Lead - AI Infrastructure (SaaS)",
  description: "We need someone to manage complex vendor negotiation and resource allocation for our growing data center footprint. Requires SAP experience and high-stakes troubleshooting.",
  requirements: "SaaS experience preferred. Background in scaling systems."
};

console.log('Testing V3 Scoring Logic...');
const result = scoreOpportunity(opp);
console.log('Score:', result.relevance_score);
console.log('Reasons:', result.match_reasons);

const hasAtomic = result.match_reasons.some(r => r.startsWith('atomic:'));
const hasNode = result.match_reasons.some(r => r.startsWith('node:'));

if (result.relevance_score > 0.5 && hasAtomic && hasNode) {
  console.log('SUCCESS: V3 Scoring logic is correctly mapping atomic skills.');
} else {
  console.log('FAILURE: Scoring logic regression detected.');
  process.exit(1);
}
