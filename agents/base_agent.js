/**
 * BaseAgent.js
 * 
 * Every specialized agent (Scrapers, Resume Editors, Social Media Connectors) 
 * should extend this class to ensure consistent logging and API communication.
 */
import 'dotenv/config';

class BaseAgent {
    constructor(name) {
        this.name = name;
        this.hubUrl = process.env.HUB_URL || 'http://localhost:3000';
    }

    log(message) {
        console.log(`[${this.name}] ${new Date().toISOString()}: ${message}`);
    }

    async sendToHub(endpoint, data) {
        this.log(`Sending data to ${endpoint}...`);
        const headers = { 'Content-Type': 'application/json' };
        if (process.env.INTERNAL_API_KEY) {
            headers['X-API-Key'] = process.env.INTERNAL_API_KEY;
        }
        try {
            const response = await fetch(`${this.hubUrl}${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(data),
            });
            return await response.json();
        } catch (error) {
            this.log(`Error sending to Hub: ${error.message}`);
        }
    }
}

export default BaseAgent;
