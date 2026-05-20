import { scoreOpportunity } from '../logic/relevance.js';

function testV32() {
  console.log('--- Testing V3.2 Non-Linear Scoring ---');

  const cases = [
    {
      name: "High Leverage Industrial (Tool + Scale + Context)",
      role_title: "Project Lead - Mega-Scale Foundry Construction",
      description: "Manage a large team of 50+ contractors for a new semiconductor plant. Use PSCAD and SAP for site reconciliation.",
      sector: "Semiconductor Foundries"
    },
    {
      name: "Industrial Match but No Tools",
      role_title: "Site Manager",
      description: "Manage 50+ contractors on a construction site.",
      sector: "Power"
    },
    {
      name: "Pure Digital (Decay Test)",
      role_title: "Software Engineer",
      description: "Build SaaS consumer apps using React and Node.",
      sector: "SaaS"
    }
  ];

  for (const c of cases) {
    const result = scoreOpportunity(c);
    console.log(`Case: ${c.name}`);
    console.log(`Score: ${result.relevance_score}`);
    console.log(`Reasons: ${result.match_reasons.join(', ')}`);
    console.log('---');
  }
}

testV32();
