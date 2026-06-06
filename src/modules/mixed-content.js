const axios = require('axios');

async function checkMixedContent(domain) {
    try {
        const res = await axios.get(`https://${domain}`, {
            timeout: 5000,
            validateStatus: () => true
        });

        const html = res.data;
        if (typeof html !== 'string') {
            return { error: 'Could not fetch HTML content' };
        }

        const byType = { scripts: 0, stylesheets: 0, images: 0, iframes: 0, forms: 0, other: 0 };
        const examples = [];
        
        const patterns = [
            { type: 'scripts', regex: /<script[^>]+src=["'](http:\/\/[^"']+)["']/gi },
            { type: 'stylesheets', regex: /<link[^>]+href=["'](http:\/\/[^"']+)["'][^>]*rel=["']stylesheet["']/gi },
            { type: 'images', regex: /<img[^>]+src=["'](http:\/\/[^"']+)["']/gi },
            { type: 'iframes', regex: /<iframe[^>]+src=["'](http:\/\/[^"']+)["']/gi },
            { type: 'forms', regex: /<form[^>]+action=["'](http:\/\/[^"']+)["']/gi },
            { type: 'other', regex: /<(?:object|embed)[^>]+(?:data|src)=["'](http:\/\/[^"']+)["']/gi }
        ];

        let totalIssues = 0;

        patterns.forEach(p => {
            let match;
            while ((match = p.regex.exec(html)) !== null) {
                totalIssues++;
                byType[p.type]++;
                if (examples.length < 5) {
                    examples.push(match[1]);
                }
            }
        });

        return {
            hasMixedContent: totalIssues > 0,
            totalIssues,
            byType,
            examples
        };

    } catch (error) {
        return { error: 'Failed to check mixed content' };
    }
}

module.exports = { checkMixedContent };
