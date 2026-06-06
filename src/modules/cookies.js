const axios = require('axios');

const TRACKING_PATTERNS = [
    '_ga', '_gid', '_fbp', '_gcl', '__utm',
    '_hjid', 'hubspot', '_mkto', 'intercom'
];

function parseCookie(setCookieStr) {
    const parts = setCookieStr.split(';').map(p => p.trim());
    const [nameValue] = parts;
    const eqIndex = nameValue.indexOf('=');
    const name = eqIndex !== -1 ? nameValue.substring(0, eqIndex).trim() : nameValue.trim();

    const flags = {
        name,
        secure: false,
        httpOnly: false,
        sameSite: null,
        path: null,
        domain: null,
        expires: null,
        maxAge: null
    };

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        const lower = part.toLowerCase();

        if (lower === 'secure') {
            flags.secure = true;
        } else if (lower === 'httponly') {
            flags.httpOnly = true;
        } else if (lower.startsWith('samesite=')) {
            flags.sameSite = part.split('=')[1].trim();
        } else if (lower.startsWith('path=')) {
            flags.path = part.split('=')[1].trim();
        } else if (lower.startsWith('domain=')) {
            flags.domain = part.split('=')[1].trim();
        } else if (lower.startsWith('expires=')) {
            flags.expires = part.substring(part.indexOf('=') + 1).trim();
        } else if (lower.startsWith('max-age=')) {
            flags.maxAge = parseInt(part.split('=')[1].trim(), 10);
        }
    }

    return flags;
}

function isTrackingCookie(name) {
    const lower = name.toLowerCase();
    return TRACKING_PATTERNS.some(pattern => lower.includes(pattern.toLowerCase()));
}

async function checkCookies(domain) {
    try {
        const res = await axios.get(`https://${domain}`, {
            timeout: 5000,
            validateStatus: () => true,
            // Don't follow redirects so we capture cookies at each stage
            maxRedirects: 5
        });

        const setCookieHeaders = res.headers['set-cookie'] || [];
        const cookies = setCookieHeaders.map(parseCookie);

        const totalCount = cookies.length;
        const missingSecure = cookies.filter(c => !c.secure).length;
        const missingHttpOnly = cookies.filter(c => !c.httpOnly).length;
        const missingSameSite = cookies.filter(c => !c.sameSite).length;
        const trackingCookies = cookies.filter(c => isTrackingCookie(c.name)).map(c => c.name);

        // Determine overall security rating
        let rating = 'good';
        if (totalCount > 0) {
            const totalFlags = totalCount * 3; // 3 flags per cookie: secure, httpOnly, sameSite
            const missingFlags = missingSecure + missingHttpOnly + missingSameSite;
            const missingRatio = missingFlags / totalFlags;

            if (missingRatio > 0.5) {
                rating = 'bad';
            } else if (missingRatio > 0) {
                rating = 'warning';
            }
        }

        return {
            totalCount,
            cookies,
            missingSecure,
            missingHttpOnly,
            missingSameSite,
            trackingCookies,
            hasTrackingCookies: trackingCookies.length > 0,
            rating
        };
    } catch (error) {
        return { error: 'Could not check cookies' };
    }
}

module.exports = { checkCookies };
