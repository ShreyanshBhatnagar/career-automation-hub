import { scoreOpportunity } from './logic/relevance.js';

const opp = {
  role_title: "Operations Lead - Semiconductor Foundry Construction",
  description: "Manage 50+ contractors for the implementation of a new mega-scale plant. Requires SAP ERP operational control and vendor negotiation.",
  sector: "Semiconductor Foundries"
};

console.log('Testing Industrial V3.1 Scoring Logic...');
const result = scoreOpportunity(opp);
console.log('Score:', result.relevance_score);
console.log('Reasons:', result.match_reasons);

const hasAtomic = result.match_reasons.some(r => r.startsWith('atomic:'));
const hasNode = result.match_reasons.some(r => r.startsWith('node:'));
const hasArbitrage = result.match_reasons.some(r => r.startsWith('arbitrage:'));

if (result.relevance_score > 0.5 && (hasAtomic || hasNode || hasArbitrage)) {
  console.log('SUCCESS: Industrial V3.1 Scoring logic is correctly mapping atomic industrial skills.');
} else {
  console.log('FAILURE: Scoring logic regression detected.');
  process.exit(1);
}
