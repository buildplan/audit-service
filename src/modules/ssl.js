const tls = require('tls');

function checkSSL(domain) {
    return new Promise((resolve) => {
        let isResolved = false;
        
        const doResolve = (data) => {
            if (!isResolved) {
                isResolved = true;
                resolve(data);
            }
        };

        const socket = tls.connect({
            host: domain,
            port: 443,
            servername: domain,
            rejectUnauthorized: false,
            timeout: 5000
        }, () => {
            const cert = socket.getPeerCertificate(true);
            const cipher = socket.getCipher();
            const protocol = socket.getProtocol();
            
            if (!cert || Object.keys(cert).length === 0) {
                socket.end();
                return doResolve({ valid: false, error: 'No certificate presented' });
            }

            const validTo = new Date(cert.valid_to);
            const daysRemaining = Math.floor((validTo - new Date()) / (1000 * 60 * 60 * 24));
            const valid = daysRemaining > 0 && !cert.subject?.CN?.includes('invalid');

            let chainDepth = 0;
            let currentCert = cert;
            while (currentCert.issuerCertificate && currentCert.issuerCertificate !== currentCert) {
                chainDepth++;
                currentCert = currentCert.issuerCertificate;
                if (chainDepth > 10) break;
            }
            if (currentCert.issuerCertificate === currentCert) {
                chainDepth++;
            }

            let ocspUrl = null;
            if (cert.infoAccess) {
                const ocspInfo = cert.infoAccess['OCSP - URI'];
                if (ocspInfo && ocspInfo.length > 0) {
                    ocspUrl = ocspInfo[0];
                }
            }

            const subject = cert.subject.CN || 'Unknown';
            const issuer = cert.issuer.O || cert.issuer.CN || 'Unknown';
            const isSelfSigned = (cert.subject.CN === cert.issuer.CN && cert.subject.O === cert.issuer.O);

            const result = {
                valid: valid,
                daysRemaining: daysRemaining,
                issuer: issuer,
                validFrom: cert.valid_from,
                validTo: cert.valid_to,
                subject: subject,
                sans: cert.subjectaltname ? cert.subjectaltname.split(', ').map(s => s.replace('DNS:', '')) : [subject],
                serialNumber: cert.serialNumber,
                protocol: protocol,
                cipher: cipher.name,
                keySize: cert.bits || null,
                keyType: cert.pubkeyAlgorithm || null,
                isSelfSigned: isSelfSigned,
                chainDepth: chainDepth,
                vulnerabilities: {
                    tls10: false,
                    tls11: false
                },
                ocspUrl: ocspUrl
            };
            
            socket.end();

            checkVulnerableTLS(domain).then(vulns => {
                result.vulnerabilities = vulns;
                doResolve(result);
            });
        });

        socket.on('error', (err) => {
            doResolve({ valid: false, error: 'Connection failed' });
        });

        socket.on('timeout', () => {
            socket.destroy();
            doResolve({ valid: false, error: 'Connection timed out' });
        });
    });
}

async function checkVulnerableTLS(domain) {
    const vulns = { tls10: false, tls11: false };
    
    const checkProtocol = (proto) => {
        return new Promise((resolve) => {
            const socket = tls.connect({
                host: domain,
                port: 443,
                servername: domain,
                secureProtocol: proto,
                rejectUnauthorized: false,
                timeout: 2000
            }, () => {
                socket.end();
                resolve(true);
            });
            socket.on('error', () => resolve(false));
            socket.on('timeout', () => { socket.destroy(); resolve(false); });
        });
    };

    vulns.tls10 = await checkProtocol('TLSv1_method');
    vulns.tls11 = await checkProtocol('TLSv1_1_method');
    
    return vulns;
}

module.exports = { checkSSL };
