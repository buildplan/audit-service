const axios = require('axios');

async function checkWhois(domain) {
    try {
        const res = await axios.get(`https://whois.wiredalter.com/api/lookup/${domain}`, {
            timeout: 5000
        });
        
        const data = res.data;
        
        return {
            registrar: data.registrar || 'Unknown',
            createdDate: data.createdDate || null,
            expiryDate: data.expiryDate || null,
            domainAge: data.domainAge || null,
            nameServers: data.nameServers || [],
            registrant: {
                country: data.registrant?.country || null,
                org: data.registrant?.org || null
            }
        };
    } catch (error) {
        return { error: 'WHOIS lookup failed or timed out' };
    }
}

module.exports = { checkWhois };
