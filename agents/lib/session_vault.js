/**
 * SessionVault
 *
 * Stores and rotates authenticated session tokens for scraping platforms.
 * Sessions are loaded from environment variables at startup.
 *
 * Env vars (semicolon-separated token lists):
 *   LINKEDIN_SESSIONS=token1;token2;token3
 *   INDEED_SESSIONS=token1;token2
 *   GLASSDOOR_SESSIONS=token1
 *
 * Note: This is an in-memory store. Sessions reset on worker restart.
 * For production persistence, replace the in-memory arrays with an
 * encrypted Redis hash or a secrets manager (e.g., AWS Secrets Manager).
 */

const SUPPORTED_PLATFORMS = ['linkedin', 'indeed', 'glassdoor'];

function loadSessionsFromEnv(envKey) {
  const raw = process.env[envKey];
  if (!raw) return [];
  return raw
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

class SessionVault {
  constructor() {
    this.sessions = {
      linkedin:   loadSessionsFromEnv('LINKEDIN_SESSIONS'),
      indeed:     loadSessionsFromEnv('INDEED_SESSIONS'),
      glassdoor:  loadSessionsFromEnv('GLASSDOOR_SESSIONS'),
    };

    for (const platform of SUPPORTED_PLATFORMS) {
      const count = this.sessions[platform].length;
      if (count > 0) {
        console.log(`[SessionVault] Loaded ${count} session(s) for ${platform}`);
      }
    }
  }

  /**
   * Returns the next available session token for a platform using round-robin rotation.
   * Returns null if no sessions are configured for that platform.
   */
  getNextSession(platform) {
    const pool = this.sessions[platform];
    if (!pool || pool.length === 0) return null;

    // Round-robin: shift from front, push to back
    const session = pool.shift();
    pool.push(session);
    return session;
  }

  /**
   * Removes a blocked/expired session from the pool.
   * Call this when a scraper receives a 401/403 or detects a session block.
   */
  reportSessionBlock(platform, session) {
    if (!this.sessions[platform]) return;
    const before = this.sessions[platform].length;
    this.sessions[platform] = this.sessions[platform].filter((s) => s !== session);
    const after = this.sessions[platform].length;
    if (before !== after) {
      console.warn(`[SessionVault] Removed blocked session for ${platform}. Pool size: ${after}`);
    }
  }

  /**
   * Returns the number of active sessions for a platform.
   */
  sessionCount(platform) {
    return this.sessions[platform]?.length ?? 0;
  }
}

export default new SessionVault();
