/**
 * ProxyManager
 *
 * Manages proxy pools for "Scraping" (Rotating Residential)
 * and "Execution" (Static/Sticky) profiles.
 */
class ProxyManager {
    constructor() {
        this.scrapingProxies = process.env.ROTATING_RESIDENTIAL_PROXIES?.split(',') || [];
        this.executionProxies = process.env.STATIC_EXECUTION_PROXIES?.split(',') || [];
    }

    getProxy(profile = 'scraping') {
        const pool = profile === 'execution' ? this.executionProxies : this.scrapingProxies;
        if (!pool.length) return null;

        // Simple round-robin or random selection
        const proxy = pool[Math.floor(Math.random() * pool.length)];
        return this.parseProxyString(proxy);
    }

    parseProxyString(str) {
        if (!str) return null;
        // Expected format: http://user:pass@host:port
        try {
            const url = new URL(str);
            return {
                server: `${url.protocol}//${url.host}`,
                username: url.username,
                password: url.password
            };
        } catch (e) {
            console.error('Invalid proxy string:', str);
            return null;
        }
    }
}

export default new ProxyManager();
