import { scoreOpportunity, matchesRoleKeywords } from '../logic/relevance.js';

function testRelevance() {
  console.log('--- Testing Relevance Logic ---');

  const opportunities = [
    {
      role_title: 'PSCAD Engineer',
      company_name: 'Adani Green',
      location: 'Ahmedabad',
      notes: 'Experience with MATLAB and SLD interpretation.',
      sector: 'Renewables'
    },
    {
      role_title: 'Contract Administrator',
      company_name: 'L&T',
      location: 'Mumbai',
      notes: 'SAP experience required. Handling BOQ and vendor management.',
      sector: 'Power'
    },
    {
      role_title: 'Chef',
      company_name: 'Random Hotel',
      location: 'Somewhere',
      notes: 'Need someone to cook food.',
      sector: 'Hospitality'
    }
  ];

  for (const opp of opportunities) {
    const scored = scoreOpportunity(opp);
    const matches = matchesRoleKeywords(opp.role_title + ' ' + opp.notes);
    console.log(`Role: ${opp.role_title}`);
    console.log(`Score: ${scored.relevance_score}`);
    console.log(`Is Offbeat: ${scored.is_offbeat}`);
    console.log(`Matches Keywords: ${matches}`);
    console.log('---');
  }
}

testRelevance();
