const axios = require('axios');

const SECURITY_HEADERS = [
    { name: 'strict-transport-security', label: 'HSTS', weight: 15, critical: true },
    { name: 'content-security-policy', label: 'CSP', weight: 15, critical: true },
    { name: 'x-frame-options', label: 'X-Frame-Options', weight: 10, critical: false },
    { name: 'x-content-type-options', label: 'X-Content-Type-Options', weight: 10, critical: false },
    { name: 'permissions-policy', label: 'Permissions-Policy', weight: 10, critical: false },
    { name: 'referrer-policy', label: 'Referrer-Policy', weight: 8, critical: false },
    { name: 'cross-origin-opener-policy', label: 'COOP', weight: 7, critical: false },
    { name: 'cross-origin-resource-policy', label: 'CORP', weight: 5, critical: false },
    { name: 'cross-origin-embedder-policy', label: 'COEP', weight: 5, critical: false },
    { name: 'x-permitted-cross-domain-policies', label: 'X-Permitted-Cross-Domain', weight: 3, critical: false },
    { name: 'x-dns-prefetch-control', label: 'X-DNS-Prefetch-Control', weight: 2, critical: false },
];

async function checkHeaders(domain) {
    try {
        const res = await axios.head(`https://${domain}`, {
            timeout: 5000,
            validateStatus: () => true
        });

        const headers = res.headers;
        const present = [];
        const missing = [];
        const warnings = [];
        let score = 100;
        let hstsDetails = null;

        SECURITY_HEADERS.forEach(sh => {
            const val = headers[sh.name];
            if (val) {
                present.push({ name: sh.label, value: val, critical: sh.critical });
                if (sh.name === 'strict-transport-security') {
                    hstsDetails = {
                        maxAge: null,
                        includeSubDomains: val.toLowerCase().includes('includesubdomains'),
                        preload: val.toLowerCase().includes('preload')
                    };
                    const maxAgeMatch = val.match(/max-age=(\d+)/i);
                    if (maxAgeMatch) {
                        hstsDetails.maxAge = parseInt(maxAgeMatch[1], 10);
                    }
                }
            } else {
                score -= sh.weight;
                missing.push({ name: sh.label, critical: sh.critical, impact: sh.weight >= 10 ? 'High' : (sh.weight >= 5 ? 'Medium' : 'Low') });
            }
        });

        const serverHeader = headers['server'];
        if (serverHeader) {
            score -= 5;
            if (/[0-9]/.test(serverHeader)) {
                score -= 3;
                warnings.push(`Server header reveals version: ${serverHeader}`);
            } else {
                warnings.push(`Server header is present: ${serverHeader}`);
            }
        }

        const poweredBy = headers['x-powered-by'];
        if (poweredBy) {
            score -= 5;
            warnings.push(`X-Powered-By header is present: ${poweredBy}`);
        }

        score = Math.max(0, score);
        let grade = 'F';
        if (score === 100) grade = 'A+';
        else if (score >= 90) grade = 'A';
        else if (score >= 75) grade = 'B';
        else if (score >= 60) grade = 'C';
        else if (score >= 40) grade = 'D';

        return {
            grade,
            score,
            present,
            missing,
            warnings,
            server: serverHeader || 'Hidden',
            poweredBy: poweredBy || 'Hidden',
            hstsDetails,
            allHeaders: headers
        };
    } catch (error) {
        return { grade: 'F', score: 0, error: 'Could not connect' };
    }
}

module.exports = { checkHeaders };
