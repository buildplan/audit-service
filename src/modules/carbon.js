const { co2, hosting } = require('@tgwf/co2');
const { check: checkCarbonTxt } = require('@tgwf/co2/carbon-txt');
const axios = require('axios');

async function estimateCarbon(domain) {
    try {
        // 1. Get raw bytes (approximate via HEAD request)
        // A real lighthouse scan gives exact bytes, but for Tier 1 we estimate
        const res = await axios.get(`https://${domain}`, { timeout: 4000 });
        const bytes = parseInt(res.headers['content-length'] || 0) + (res.data ? res.data.length : 0);

        if (bytes === 0) return { co2: 0, green: false };

        // 2. Calculate
        const swd = new co2({ model: 'swd' });
        const emissions = swd.perByte(bytes);

        // 3. Check Green Hosting
        const greenCheck = await hosting.check(domain);

        // 4. Check for carbon.txt
        let carbonTxt = null;
        try {
            // Note: Green Web Foundation API key is required. 
            // We use process.env.GWF_API_KEY or default to empty string.
            const options = { apiKey: process.env.GWF_API_KEY || '', verbose: false };
            const txtResult = await checkCarbonTxt(domain, options);
            if (txtResult && txtResult.success) {
                carbonTxt = txtResult;
            }
        } catch (err) {
            // Ignore errors if the check fails (e.g. no carbon.txt or invalid API key)
            console.error(`[Carbon.txt] Check failed for ${domain}:`, err.message);
        }

        return {
            co2: emissions.toFixed(3),
            green: greenCheck,
            bytes: bytes,
            carbonTxt: carbonTxt
        };
    } catch (e) {
        return { error: 'Could not estimate' };
    }
}

module.exports = { estimateCarbon };
