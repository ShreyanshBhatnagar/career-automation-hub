/**
 * BaseAgent.js
 *
 * Every specialised agent extends this class for consistent logging,
 * hub communication, and error handling.
 */
import 'dotenv/config';

const HUB_TIMEOUT_MS = 15_000; // 15 s — never block indefinitely on a hung hub

class BaseAgent {
  constructor(name) {
    this.name = name;
    this.hubUrl = process.env.HUB_URL || 'http://localhost:3000';
  }

  log(message) {
    console.log(`[${this.name}] ${new Date().toISOString()}: ${message}`);
  }

  /**
   * POST data to the hub API.
   * Throws on network error, non-2xx response, or timeout.
   * Callers must handle the error — silent swallowing is not acceptable.
   */
  async sendToHub(endpoint, data) {
    this.log(`Sending data to ${endpoint}…`);

    const headers = { 'Content-Type': 'application/json' };
    const apiKey = process.env.INTERNAL_API_KEY;
    if (!apiKey) {
      throw new Error(`[${this.name}] INTERNAL_API_KEY is not set — cannot authenticate with hub`);
    }
    headers['X-API-Key'] = apiKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HUB_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(`${this.hubUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err.name === 'AbortError'
        ? `Hub request timed out after ${HUB_TIMEOUT_MS}ms (${endpoint})`
        : `Hub request failed (${endpoint}): ${err.message}`;
      this.log(msg);
      throw new Error(msg);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const msg = `Hub returned ${response.status} for ${endpoint}: ${body.slice(0, 200)}`;
      this.log(msg);
      throw new Error(msg);
    }

    return response.json();
  }
}

export default BaseAgent;
