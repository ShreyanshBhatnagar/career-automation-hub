/**
 * SessionVault
 *
 * Securely stores and rotates authenticated session tokens
 * for various platforms (LinkedIn, Indeed, etc.).
 */
class SessionVault {
    constructor() {
        this.sessions = {
            linkedin: [],
            indeed: [],
            glassdoor: []
        };
        // Load from environment or encrypted store in production
        if (process.env.LINKEDIN_SESSIONS) {
            this.sessions.linkedin = process.env.LINKEDIN_SESSIONS.split(';');
        }
    }

    getNextSession(platform) {
        const pool = this.sessions[platform];
        if (!pool || !pool.length) return null;

        // Rotate: shift and push back
        const session = pool.shift();
        pool.push(session);
        return session;
    }

    reportSessionBlock(platform, session) {
        console.warn(`[SessionVault] Session blocked for ${platform}: ${session.slice(0, 10)}...`);
        this.sessions[platform] = this.sessions[platform].filter(s => s !== session);
    }
}

export default new SessionVault();
