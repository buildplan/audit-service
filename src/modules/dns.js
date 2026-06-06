const dns = require('dns').promises;
const axios = require('axios');

const RESOLVE_TIMEOUT_MS = 5000;

/**
 * Wrap a promise with a timeout.
 * Resolves to the fallback value if the operation exceeds the deadline.
 */
function withTimeout(promise, ms, fallback) {
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Safely resolve a DNS record type, returning `fallback` on any error.
 */
async function safeResolve(domain, rrtype, fallback = []) {
    try {
        const result = await withTimeout(
            dns.resolve(domain, rrtype),
            RESOLVE_TIMEOUT_MS,
            fallback,
        );
        return result;
    } catch {
        return fallback;
    }
}

/**
 * Safely resolve SOA record, returning null on any error.
 */
async function safeSoa(domain) {
    try {
        const soa = await withTimeout(
            dns.resolveSoa(domain),
            RESOLVE_TIMEOUT_MS,
            null,
        );
        if (!soa) return null;
        return {
            nsname: soa.nsname,
            hostmaster: soa.hostmaster,
            serial: soa.serial,
        };
    } catch {
        return null;
    }
}

/**
 * Analyse TXT records for email-security indicators (SPF, DMARC, DKIM).
 */
async function analyseEmailSecurity(domain, txtRecords) {
    // --- SPF ---
    const flatTxt = txtRecords.map(r => (Array.isArray(r) ? r.join('') : r));
    const spfRecord = flatTxt.find(t => t.startsWith('v=spf1'));
    const spf = {
        exists: !!spfRecord,
        record: spfRecord || null,
    };

    // --- DMARC ---
    let dmarc = { exists: false, record: null };
    try {
        const dmarcRecords = await withTimeout(
            dns.resolve(`_dmarc.${domain}`, 'TXT'),
            RESOLVE_TIMEOUT_MS,
            [],
        );
        const flatDmarc = dmarcRecords.map(r => (Array.isArray(r) ? r.join('') : r));
        const dmarcRecord = flatDmarc.find(t => t.toLowerCase().startsWith('v=dmarc1'));
        if (dmarcRecord) {
            dmarc = { exists: true, record: dmarcRecord };
        }
    } catch {
        // DMARC record doesn't exist — that's fine
    }

    // --- DKIM (existence check only) ---
    let dkim = { exists: false };
    try {
        const dkimRecords = await withTimeout(
            dns.resolve(`default._domainkey.${domain}`, 'TXT'),
            RESOLVE_TIMEOUT_MS,
            [],
        );
        if (dkimRecords.length > 0) {
            dkim = { exists: true };
        }
    } catch {
        // DKIM record doesn't exist — that's fine
    }

    return { spf, dmarc, dkim };
}

/**
 * Call the external WiredAlter DNS API for geo/ASN enrichment.
 * Returns the data or null if the service is unavailable.
 */
async function fetchExternalData(domain) {
    try {
        const res = await axios.get(
            `https://dns.wiredalter.com/api/lookup/${domain}`,
            { timeout: RESOLVE_TIMEOUT_MS },
        );
        return res.data;
    } catch {
        return null;
    }
}

/**
 * Format CAA records into a cleaner structure.
 * Raw CAA records from dns.resolve come as objects with { critical, issue/issuewild/iodef }.
 */
function formatCaa(rawRecords) {
    return rawRecords.map(r => ({
        critical: r.critical || 0,
        issue: r.issue || r.issuewild || r.iodef || null,
    }));
}

async function checkDNS(domain) {
    try {
        // Kick off all lookups in parallel
        const [a, aaaa, mx, ns, txt, caaRaw, soa, external] = await Promise.all([
            safeResolve(domain, 'A'),
            safeResolve(domain, 'AAAA'),
            safeResolve(domain, 'MX'),
            safeResolve(domain, 'NS'),
            safeResolve(domain, 'TXT'),
            safeResolve(domain, 'CAA'),
            safeSoa(domain),
            fetchExternalData(domain),
        ]);

        // Flatten TXT records (dns module returns arrays of chunks)
        const flatTxt = txt.map(r => (Array.isArray(r) ? r.join('') : r));

        // Format MX for a consistent shape
        const formattedMx = mx.map(r => ({
            priority: r.priority,
            exchange: r.exchange,
        }));

        const caa = formatCaa(caaRaw);

        // Email security analysis (depends on TXT results)
        const emailSecurity = await analyseEmailSecurity(domain, txt);

        return {
            a,
            aaaa,
            mx: formattedMx,
            ns,
            txt: flatTxt,
            caa,
            soa,
            emailSecurity,
            external,
        };
    } catch (error) {
        return { error: 'DNS Lookup Failed' };
    }
}

module.exports = { checkDNS };
