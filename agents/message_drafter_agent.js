import BaseAgent from './base_agent.js';
import fs from 'fs';

/**
 * MessageDrafterAgent
 *
 * Structures hyper-personalized outreach messages optimized for
 * industrial hiring managers or founders.
 */
class MessageDrafterAgent extends BaseAgent {
    constructor() {
        super('MessageDrafterAgent');
    }

    async draftMessage(opportunity, profilePath, contact = null) {
        this.log('Drafting personalized outreach message...');

        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
        const primaryLeverage = profile.leverage_points?.[0] || {};

        const recipientName = contact ? contact.person_name : 'Hiring Manager';
        const companyName = opportunity ? opportunity.company_name : (contact ? contact.company_name : 'your team');
        const roleTitle = opportunity ? opportunity.role_title : 'Industrial Operations';

        const message = `
Dear ${recipientName},

I saw that ${companyName} is expanding into ${opportunity?.sector || 'the industrial sector'} and looking for a ${roleTitle}.

While many candidates focus on the digital layer, my expertise is in hard-infrastructure reality. I specialize in ${primaryLeverage.node}, specifically managing 50+ contractors on the ground in high-stakes environments like Jaisalmer. I noticed your focus on ${opportunity?.description?.slice(0, 40) || 'scaling infrastructure'} and believe my experience with ${primaryLeverage.atomic_skills?.[0] || 'Contractor Management'} directly maps to your current operational challenges.

I'd love to discuss how I can help neutralize execution risks for your next mega-scale project.

Best regards,
The Brother
        `.trim();

        return message;
    }
}

export default MessageDrafterAgent;
