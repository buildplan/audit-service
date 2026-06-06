const axios = require('axios');

function parseRobotsTxt(content) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const rules = [];
    const sitemaps = [];
    let currentRule = null;
    let crawlDelay = null;

    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const directive = line.substring(0, colonIndex).trim().toLowerCase();
        const value = line.substring(colonIndex + 1).trim();

        if (directive === 'user-agent') {
            currentRule = { userAgent: value, disallow: [], allow: [] };
            rules.push(currentRule);
        } else if (directive === 'disallow' && currentRule) {
            if (value) currentRule.disallow.push(value);
        } else if (directive === 'allow' && currentRule) {
            if (value) currentRule.allow.push(value);
        } else if (directive === 'sitemap') {
            sitemaps.push(value);
        } else if (directive === 'crawl-delay') {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) crawlDelay = parsed;
        }
    }

    return { rules, sitemaps, crawlDelay };
}

async function checkRobots(domain) {
    try {
        const res = await axios.get(`https://${domain}/robots.txt`, {
            timeout: 4000,
            validateStatus: () => true
        });

        if (res.status === 404 || res.status >= 400) {
            return {
                exists: false,
                sitemaps: [],
                rules: [],
                crawlDelay: null,
                isFullyBlocked: false
            };
        }

        const content = typeof res.data === 'string' ? res.data : String(res.data);
        const { rules, sitemaps, crawlDelay } = parseRobotsTxt(content);

        // Check if site is fully blocked (any rule has "Disallow: /")
        const isFullyBlocked = rules.some(rule =>
            rule.userAgent === '*' && rule.disallow.includes('/')
        );

        const totalDisallowed = rules.reduce((sum, rule) => sum + rule.disallow.length, 0);

        return {
            exists: true,
            sitemaps,
            rules,
            crawlDelay,
            isFullyBlocked,
            totalDisallowed
        };
    } catch (error) {
        return { error: 'Could not check robots.txt' };
    }
}

module.exports = { checkRobots };
