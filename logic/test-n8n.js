import 'dotenv/config';

/**
 * n8n API Test Script
 * This script demonstrates how to safely use your N8N_API_KEY from the .env file.
 */

const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_BASE_URL = process.env.N8N_BASE_URL || 'http://localhost:5678';

async function testConnection() {
    console.log('--- n8n Connection Test ---');
    console.log(`Targeting: ${N8N_BASE_URL}`);

    if (!N8N_API_KEY) {
        console.error('Error: Set N8N_API_KEY in .env (never commit .env to Git).');
        return;
    }

    try {
        // We'll try to list your workflows as a simple connectivity test
        const response = await fetch(`${N8N_BASE_URL}/api/v1/workflows?limit=5`, {
            method: 'GET',
            headers: {
                'X-N8N-API-KEY': N8N_API_KEY,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP Error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Success! Connected to n8n.');
        console.log(`Found ${data.data.length} workflows (limited to first 5).`);
        
    } catch (error) {
        console.error('❌ Connection failed!');
        console.error(error.message);
        console.log('\nTip: Make sure n8n is running locally at the URL above.');
    }
}

testConnection();
