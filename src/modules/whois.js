const axios = require('axios');

async function checkWhois(domain) {
    try {
        const res = await axios.get(`https://whois.wiredalter.com/api/lookup/${domain}`, {
            timeout: 5000
        });
        
        const data = res.data;
        
        const parsed = data.parsed || {};
        
        // Calculate domain age if created date exists
        let domainAge = null;
        if (parsed.created) {
            const created = new Date(parsed.created);
            const now = new Date();
            domainAge = Math.floor((now - created) / (1000 * 60 * 60 * 24));
        }

        return {
            registrar: parsed.registrar || 'Unknown',
            createdDate: parsed.created || null,
            expiryDate: parsed.expires || null,
            domainAge: domainAge,
            nameServers: parsed.nameservers || [],
            registrant: {
                country: parsed.registrant_country || null,
                org: parsed.registrant_organization || null
            }
        };
    } catch (error) {
        return { error: 'WHOIS lookup failed or timed out' };
    }
}

module.exports = { checkWhois };
