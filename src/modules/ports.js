const net = require('net');

const PORTS = [
    { port: 21, service: 'FTP', risk: 'high' },
    { port: 22, service: 'SSH', risk: 'medium' },
    { port: 23, service: 'Telnet', risk: 'critical' },
    { port: 25, service: 'SMTP', risk: 'medium' },
    { port: 53, service: 'DNS', risk: 'low' },
    { port: 80, service: 'HTTP', risk: 'low' },
    { port: 110, service: 'POP3', risk: 'high' },
    { port: 143, service: 'IMAP', risk: 'high' },
    { port: 443, service: 'HTTPS', risk: 'low' },
    { port: 445, service: 'SMB', risk: 'critical' },
    { port: 465, service: 'SMTPS', risk: 'low' },
    { port: 587, service: 'SMTP Submission', risk: 'low' },
    { port: 993, service: 'IMAPS', risk: 'low' },
    { port: 995, service: 'POP3S', risk: 'low' },
    { port: 1433, service: 'MSSQL', risk: 'critical' },
    { port: 1521, service: 'Oracle DB', risk: 'critical' },
    { port: 3306, service: 'MySQL', risk: 'critical' },
    { port: 3389, service: 'RDP', risk: 'critical' },
    { port: 5432, service: 'PostgreSQL', risk: 'critical' },
    { port: 5900, service: 'VNC', risk: 'critical' },
    { port: 6379, service: 'Redis', risk: 'critical' },
    { port: 8080, service: 'HTTP Proxy', risk: 'medium' },
    { port: 8443, service: 'HTTPS Alt', risk: 'low' },
    { port: 27017, service: 'MongoDB', risk: 'critical' },
];

function checkPort(domain, port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        // Hard timeout: 2000ms (2 seconds) per port
        // Since we run in parallel, total time is ~2 seconds.
        socket.setTimeout(2000);

        socket.on('connect', () => {
            socket.destroy(); // Close immediately, we just wanted to see if it's open
            resolve(true);    // Port is OPEN
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);   // Port is TIMED OUT (Closed/Filtered)
        });

        socket.on('error', () => {
            socket.destroy();
            resolve(false);   // Port is ERROR (Closed)
        });

        socket.connect(port, domain);
    });
}

/**
 * Derive a security rating from the list of open ports.
 *   - "danger"  → any critical-risk port is open
 *   - "warning" → any high or medium risk port is open
 *   - "good"    → only low-risk ports are open (or none at all)
 */
function deriveSecurityRating(openPorts) {
    const risks = openPorts.map(p => p.risk);
    if (risks.includes('critical')) return 'danger';
    if (risks.includes('high') || risks.includes('medium')) return 'warning';
    return 'good';
}

async function checkPorts(domain) {
    try {
        // Run all checks simultaneously
        const checks = PORTS.map(entry =>
            checkPort(domain, entry.port).then(isOpen => ({ ...entry, isOpen }))
        );

        const results = await Promise.all(checks);

        const openPorts = results
            .filter(r => r.isOpen)
            .map(({ port, service, risk }) => ({ port, service, risk }));

        const closedCount = results.filter(r => !r.isOpen).length;

        // Tally open ports by risk level
        const riskSummary = { critical: 0, high: 0, medium: 0, low: 0 };
        for (const p of openPorts) {
            riskSummary[p.risk]++;
        }

        return {
            open: openPorts,
            closed: closedCount,
            totalScanned: PORTS.length,
            riskSummary,
            securityRating: deriveSecurityRating(openPorts),
        };
    } catch (error) {
        return { error: 'Port scan failed' };
    }
}

module.exports = { checkPorts };
