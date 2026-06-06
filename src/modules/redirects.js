const axios = require('axios');

async function checkRedirects(domain) {
    try {
        const chain = [];
        let currentUrl = `http://${domain}`;
        const visitedUrls = new Set();
        let hasLoop = false;
        let httpToHttps = false;
        const maxHops = 10;

        for (let i = 0; i < maxHops; i++) {
            if (visitedUrls.has(currentUrl)) {
                hasLoop = true;
                break;
            }
            visitedUrls.add(currentUrl);

            let res;
            try {
                res = await axios.get(currentUrl, {
                    timeout: 4000,
                    maxRedirects: 0,
                    validateStatus: () => true
                });
            } catch (error) {
                // If the request itself fails (e.g. ECONNREFUSED), record and stop
                chain.push({ url: currentUrl, statusCode: null, location: null, error: error.message });
                break;
            }

            const location = res.headers['location'] || null;
            chain.push({
                url: currentUrl,
                statusCode: res.status,
                location
            });

            // Check for HTTP → HTTPS redirect
            if (currentUrl.startsWith('http://') && location && location.startsWith('https://')) {
                httpToHttps = true;
            }

            // If not a redirect status, we've reached the final destination
            if (res.status < 300 || res.status >= 400 || !location) {
                break;
            }

            // Resolve relative Location headers
            try {
                currentUrl = new URL(location, currentUrl).href;
            } catch {
                // Malformed location header, stop following
                break;
            }
        }

        const finalUrl = chain.length > 0 ? chain[chain.length - 1].url : `http://${domain}`;

        // Detect www normalization
        let wwwRedirect = null;
        if (chain.length >= 2) {
            const firstHost = new URL(chain[0].url).hostname;
            const lastHost = new URL(finalUrl).hostname;
            if (firstHost.startsWith('www.') && !lastHost.startsWith('www.')) {
                wwwRedirect = 'www-to-non-www';
            } else if (!firstHost.startsWith('www.') && lastHost.startsWith('www.')) {
                wwwRedirect = 'non-www-to-www';
            }
        }

        return {
            chain,
            httpToHttps,
            wwwRedirect,
            totalHops: chain.length - 1, // hops = transitions, not stops
            hasLoop,
            finalUrl
        };
    } catch (error) {
        return { error: 'Could not check redirects' };
    }
}

module.exports = { checkRedirects };
