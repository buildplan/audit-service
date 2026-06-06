const axios = require('axios');

const SITEMAP_PATHS = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap.txt'];

async function checkSitemap(domain) {
    try {
        for (const path of SITEMAP_PATHS) {
            const url = `https://${domain}${path}`;

            let res;
            try {
                res = await axios.get(url, {
                    timeout: 4000,
                    validateStatus: () => true,
                    // Get text to avoid axios auto-parsing XML
                    responseType: 'text'
                });
            } catch {
                // Network error on this path, try next
                continue;
            }

            if (res.status !== 200) continue;

            const contentType = res.headers['content-type'] || '';
            const body = typeof res.data === 'string' ? res.data : String(res.data);

            // Determine format
            let format = null;
            if (path.endsWith('.txt') || contentType.includes('text/plain')) {
                format = 'txt';
            } else if (
                contentType.includes('xml') ||
                contentType.includes('text/xml') ||
                contentType.includes('application/xml') ||
                body.trimStart().startsWith('<?xml') ||
                body.trimStart().startsWith('<urlset') ||
                body.trimStart().startsWith('<sitemapindex')
            ) {
                format = 'xml';
            }

            // Count URLs
            let urlCount = 0;
            let isSitemapIndex = false;

            if (format === 'xml') {
                // Check if it's a sitemap index
                isSitemapIndex = /<sitemapindex[\s>]/i.test(body);

                if (isSitemapIndex) {
                    // Count <sitemap> entries in index
                    const sitemapMatches = body.match(/<sitemap[\s>]/gi);
                    urlCount = sitemapMatches ? sitemapMatches.length : 0;
                } else {
                    // Count <url> entries in regular sitemap
                    const urlMatches = body.match(/<url[\s>]/gi);
                    urlCount = urlMatches ? urlMatches.length : 0;
                }
            } else if (format === 'txt') {
                // Text sitemaps have one URL per line
                const lines = body.split('\n').map(l => l.trim()).filter(l => l && l.startsWith('http'));
                urlCount = lines.length;
            }

            return {
                exists: true,
                url,
                urlCount,
                isSitemapIndex,
                format,
                contentType
            };
        }

        // None of the paths returned a 200
        return {
            exists: false,
            url: null,
            urlCount: 0,
            isSitemapIndex: false,
            format: null
        };
    } catch (error) {
        return { error: 'Could not check sitemap' };
    }
}

module.exports = { checkSitemap };
