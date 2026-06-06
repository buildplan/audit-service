let pollInterval;
let currentData = {};
let currentDomain = '';

// ============================================
// UTILITY FUNCTIONS
// ============================================

function sanitizeDomain(input) {
    return input.trim()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
        .toLowerCase();
}

function isValidDomain(domain) {
    const regex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
    return regex.test(domain) && domain.length <= 253 && domain.length >= 3;
}

function showError(message) {
    const errorEl = document.getElementById('errorMsg');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function enableScanButton() {
    const scanBtn = document.getElementById('scanBtn');
    scanBtn.disabled = false;
    scanBtn.innerText = 'Scan';
}

function disableScanButton(text = 'Scanning...') {
    const scanBtn = document.getElementById('scanBtn');
    scanBtn.disabled = true;
    if (text === 'loading') {
        scanBtn.innerHTML = `<svg class="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
    } else {
        scanBtn.textContent = text;
    }
}

// --- Typewriter Placeholder ---
function startPlaceholderAnimation() {
    const input = document.getElementById('domainInput');
    const phrases = [
        "Audit a Domain: e.g. wiredalter.com", "Check Security: e.g. google.com", "Analyze Tech Stack: e.g. github.com"
    ];
    let phraseIndex = 0; let charIndex = 0; let isDeleting = false;
    function typeLoop() {
        if (input.value) { setTimeout(typeLoop, 2000); return; }
        const currentPhrase = phrases[phraseIndex];
        input.placeholder = currentPhrase.substring(0, charIndex);
        let typeSpeed = 50;
        if (isDeleting) { typeSpeed = 25; charIndex--; } else { charIndex++; }
        if (!isDeleting && charIndex === currentPhrase.length + 1) { typeSpeed = 2000; isDeleting = true; }
        else if (isDeleting && charIndex === 0) { isDeleting = false; phraseIndex = (phraseIndex + 1) % phrases.length; typeSpeed = 500; }
        setTimeout(typeLoop, typeSpeed);
    }
    typeLoop();
}

// IP Detection
document.addEventListener('DOMContentLoaded', () => {
    fetch('https://ip.wiredalter.com/api/info')
        .then(res => res.json())
        .then(data => {
            if (data.ip) {
                document.getElementById('my-ip').innerText = data.ip;
                document.getElementById('my-flag').innerText = getFlagEmoji(data.country_code || 'XX');
                document.getElementById('my-connection').classList.remove('hidden');
            }
            startPlaceholderAnimation();
        })
        .catch(e => {
            console.log('IP check failed');
            startPlaceholderAnimation();
        });
});

function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '';
    const codePoints = countryCode.toUpperCase().split('').map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
}

// ============================================
// MAIN SCAN FUNCTION
// ============================================

async function startScan() {
    // 1. Clear any previous deep scan polling
    if (pollInterval) clearInterval(pollInterval);

    let domain = document.getElementById('domainInput').value.trim();

    if (!domain) {
        showError('Please enter a domain');
        return;
    }

    domain = sanitizeDomain(domain);

    if (!isValidDomain(domain)) {
        showError('Invalid domain format (e.g., example.com)');
        return;
    }

    currentDomain = domain;

    disableScanButton('loading');

    // Reset UI
    document.getElementById('loadingSection').classList.remove('hidden');
    document.getElementById('resultsArea').classList.add('hidden');
    document.getElementById('errorMsg').classList.add('hidden');

    // Reset Deep Scan UI
    document.getElementById('deepScanSection').classList.add('hidden');
    document.getElementById('deepScanOption').classList.remove('hidden');
    document.getElementById('tier2Loading').classList.add('hidden');
    document.getElementById('tier2Results').classList.add('hidden');
    document.getElementById('screenshotContainer').classList.add('hidden');
    document.getElementById('deepError').classList.add('hidden');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); // Increased timeout for the expanded checks

        const res = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            throw new Error(`Server error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        if (!data.tier1) {
            throw new Error('Invalid response from server');
        }

        currentData = data.tier1;
        renderTier1(data.tier1);

        document.getElementById('loadingSection').classList.add('hidden');
        document.getElementById('resultsArea').classList.remove('hidden');
        document.getElementById('deepScanSection').classList.remove('hidden');

        enableScanButton();

    } catch (err) {
        document.getElementById('loadingSection').classList.add('hidden');

        let errorMsg = 'Scan failed. Please try again.';
        if (err.name === 'AbortError') {
            errorMsg = 'Request timed out. The server may be busy.';
        } else if (err.message) {
            errorMsg = err.message;
        }

        showError(errorMsg);
        enableScanButton();
    }
}

// ============================================
// TIER 1 RENDERING
// ============================================

function renderTier1(t1) {
    // 1. SSL
    const ssl = t1.ssl || {};
    const sslEl = document.getElementById('sslStatus');
    const sslDet = document.getElementById('sslDetail');
    if (ssl.valid) {
        sslEl.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400">Valid</span>`;
        sslDet.textContent = ssl.daysRemaining ? `Expires in ${ssl.daysRemaining} days` : 'Secure';
    } else {
        sslEl.innerHTML = `<span class="text-red-600 dark:text-red-400">Invalid</span>`;
        sslDet.textContent = ssl.error || 'Certificate Error';
    }

    // 2. Headers
    const h = t1.headers || {};
    const gradeEl = document.getElementById('headerGrade');
    gradeEl.textContent = h.grade || 'F';
    gradeEl.className = `text-4xl font-bold ${['A+', 'A'].includes(h.grade) ? 'text-emerald-600 dark:text-emerald-400' : (['B', 'C'].includes(h.grade) ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-500')}`;
    document.getElementById('headerScore').textContent = `Score: ${h.score || 0}/100`;

    // 3. Ports
    const p = t1.ports || {};
    const portsEl = document.getElementById('portsStatus');
    if (p.open && p.open.length > 0) {
        portsEl.innerHTML = `<span class="text-yellow-600 dark:text-yellow-400">${p.open.length} Ports Open</span>`;
    } else {
        portsEl.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400">All Common Closed</span>`;
    }
    document.getElementById('portsDetail').textContent = p.securityRating ? `Rating: ${p.securityRating}` : '';

    // 4. Whois
    const w = t1.whois || {};
    document.getElementById('whoisStatus').textContent = w.registrar || 'Unknown';
    document.getElementById('whoisDetail').textContent = w.domainAge ? `${w.domainAge} days old` : '';

    // 5. DNS
    const d = t1.dns || {};
    const dmarcExists = d.emailSecurity?.dmarc?.exists;
    document.getElementById('dnsStatus').textContent = (d.a && d.a.length) ? `${d.a.length} A records` : 'No A records';
    document.getElementById('dnsDetail').textContent = `DMARC: ${dmarcExists ? 'Yes' : 'No'}`;

    // 6. Cookies
    const c = t1.cookies || {};
    document.getElementById('cookiesStatus').textContent = `${c.totalCount || 0} Cookies`;
    document.getElementById('cookiesDetail').textContent = c.hasTrackingCookies ? 'Has Trackers' : 'Clean';

    // 7. Redirects
    const r = t1.redirects || {};
    document.getElementById('redirectsStatus').innerHTML = r.httpToHttps ? `<span class="text-emerald-600 dark:text-emerald-400">HTTP &rarr; HTTPS</span>` : `<span class="text-red-600 dark:text-red-400">Insecure</span>`;
    document.getElementById('redirectsDetail').textContent = `${r.totalHops || 0} Hops`;

    // 8. Mixed Content
    const mc = t1.mixedContent || {};
    document.getElementById('mixedContentStatus').innerHTML = mc.hasMixedContent ? `<span class="text-red-600 dark:text-red-400">Detected</span>` : `<span class="text-emerald-600 dark:text-emerald-400">Secure</span>`;
    document.getElementById('mixedContentDetail').textContent = `${mc.totalIssues || 0} Issues`;

    // 9. Robots / Sitemap
    const rob = t1.robots || {};
    const sm = t1.sitemap || {};
    document.getElementById('crawlerStatus').innerHTML = rob.isFullyBlocked ? `<span class="text-red-600 dark:text-red-400">Blocked</span>` : `<span class="text-emerald-600 dark:text-emerald-400">Crawlable</span>`;
    document.getElementById('crawlerDetail').textContent = `Sitemap: ${sm.exists ? 'Yes' : 'No'}`;

    // 10. Carbon
    const cb = t1.carbon || {};
    document.getElementById('carbonAmount').textContent = `${cb.co2 || 0}g`;
    document.getElementById('carbonGreen').innerHTML = cb.green ?
        `<span class="text-emerald-600 dark:text-emerald-400">🌱 Green Hosting</span>` :
        `<span class="text-slate-500">Standard Hosting</span>`;
}

// ============================================
// DEEP SCAN TRIGGER & POLLING
// ============================================

async function triggerDeepScan() {
    const btn = document.getElementById('deepScanBtn');
    const errEl = document.getElementById('deepError');

    btn.disabled = true;
    btn.innerHTML = `<svg class="animate-spin h-4 w-4 text-white inline mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Queuing...</span>`;
    errEl.classList.add('hidden');

    try {
        const res = await fetch('/api/scan/deep', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: currentDomain })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || data.error || 'Server error');
        }

        document.getElementById('deepScanOption').classList.add('hidden');
        setupDeepScan(currentDomain, data.id);

    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = `<span>Retry Deep Scan</span>`;
        errEl.innerText = err.message;
        errEl.classList.remove('hidden');
    }
}

function setupDeepScan(domain, scanId) {
    document.getElementById('tier2Loading').classList.remove('hidden');
    document.getElementById('tier2Results').classList.add('hidden');
    document.getElementById('screenshotContainer').classList.add('hidden');
    document.getElementById('screenshotLink').href = `https://${escapeHtml(domain)}`;

    const terminal = document.getElementById('scanTerminal');
    terminal.innerHTML = `
        <div class="text-slate-500 mb-1">$ init wiredalter-scanner --deep --target=${escapeHtml(domain)}</div>
        <div class="text-blue-400 mb-1">&gt; Spawning Headless Chrome... [OK]</div>
    `;

    pollDeepScan(scanId);
}

function addTerminalLog(msg) {
    const terminal = document.getElementById('scanTerminal');
    const logLine = document.createElement('div');
    logLine.className = 'text-emerald-400 mb-1';
    logLine.textContent = `> ${msg}`;
    terminal.appendChild(logLine);
    terminal.scrollTop = terminal.scrollHeight;
}

async function pollDeepScan(id) {
    let ticks = 0;
    const maxTicks = 120; // 2 minutes max
    clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
        ticks++;

        if (ticks === 2) addTerminalLog("Analyzing Document Object Model (DOM)...");
        if (ticks === 4) addTerminalLog("Evaluating Core Web Vitals...");
        if (ticks === 6) addTerminalLog("Running Lighthouse Audits (Perf, SEO, A11y)...");
        if (ticks === 8) addTerminalLog("Fingerprinting Tech Stack (Wappalyzer)...");

        if (ticks > maxTicks) {
            clearInterval(pollInterval);
            document.getElementById('tier2Loading').innerHTML = `<div class="text-red-600 dark:text-red-400 p-4">Deep scan timed out. Tier 1 results are still valid.</div>`;
            return;
        }

        try {
            const res = await fetch(`/api/scan/${id}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const job = await res.json();

            if (job.state === 'completed') {
                clearInterval(pollInterval);
                addTerminalLog("Analysis Complete. Rendering Report...");
                setTimeout(() => {
                    renderTier2(job.result);
                    enableScanButton();
                }, 500);
            } else if (job.state === 'failed') {
                clearInterval(pollInterval);
                const errorMsg = job.error ? escapeHtml(job.error) : 'Unknown error';
                document.getElementById('tier2Loading').innerHTML = `<div class="text-red-600 dark:text-red-400 p-4">Scan Failed: ${errorMsg}</div>`;
                enableScanButton();
            }
        } catch (err) {
            console.error('Poll error:', err);
        }
    }, 1000);
}

// ============================================
// TIER 2 RENDERING
// ============================================

let currentTier2Data = {};

function renderTier2(data) {
    currentTier2Data = data;
    document.getElementById('tier2Loading').classList.add('hidden');
    document.getElementById('tier2Results').classList.remove('hidden');

    const colorize = (score) => score >= 90 ? '#34d399' : (score >= 50 ? '#fbbf24' : '#ef4444');

    // 1. Core Scores
    const elPerf = document.getElementById('scorePerf');
    if (elPerf) {
        elPerf.textContent = Math.round(data.performance || 0);
        elPerf.style.color = colorize(data.performance || 0);
    }

    const elSeo = document.getElementById('scoreSeo');
    if (elSeo) {
        elSeo.textContent = Math.round(data.seo || 0);
        elSeo.style.color = colorize(data.seo || 0);
    }

    // 2. A11y & BP (if they exist in layout)
    const elA11y = document.getElementById('scoreA11y');
    if (elA11y) {
        elA11y.textContent = Math.round(data.accessibility || 0);
        elA11y.style.color = colorize(data.accessibility || 0);
    }
    const elBp = document.getElementById('scoreBp');
    if (elBp) {
        elBp.textContent = Math.round(data.bestPractices || 0);
        elBp.style.color = colorize(data.bestPractices || 0);
    }

    // 3. Tech Stack
    const techList = document.getElementById('techStackList');
    if (techList) {
        techList.innerHTML = '';
        if (data.tech && data.tech.length > 0) {
            data.tech.forEach(t => {
                const span = document.createElement('span');
                span.className = t.isLegacy ?
                    "px-2 py-1 rounded-md border text-xs font-mono cursor-pointer bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700/50 text-yellow-700 dark:text-yellow-500" :
                    "px-2 py-1 rounded-md border text-xs font-mono cursor-pointer bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300";

                const versionTxt = t.version ? ` v${t.version}` : '';
                span.textContent = t.name + versionTxt;

                if (t.isLegacy) {
                    span.title = 'This technology was detected by ID only. Click for more info.';
                    span.onclick = () => alert('This ID represents a proprietary technology or infrastructure detected by our 2025 signatures that does not yet have a public label in the legacy engine.');
                }

                techList.appendChild(span);
            });
        } else {
            techList.innerHTML = `<span class="text-slate-500 text-xs">No specific technologies detected.</span>`;
        }
    }

    // 4. Core Web Vitals (if exists in layout)
    const cwvGrid = document.getElementById('cwvGrid');
    if (cwvGrid) {
        cwvGrid.innerHTML = '';
        const cwv = data.coreWebVitals || {};
        ['lcp', 'fcp', 'cls', 'tbt'].forEach(key => {
            if (cwv[key]) {
                cwvGrid.innerHTML += `<div class="bg-slate-100 dark:bg-slate-800/50 p-3 rounded border border-slate-200 dark:border-slate-700/50">
                    <div class="text-xs font-bold uppercase text-slate-500">${key}</div>
                    <div class="text-lg font-mono">${cwv[key].displayValue || '-'}</div>
                </div>`;
            }
        });
    }

    // 5. Diagnostics (if exists)
    const diagEl = document.getElementById('pageDiagnostics');
    if (diagEl) {
        const diag = data.diagnostics || {};
        diagEl.innerHTML = `
            <div class="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700/50"><span class="text-slate-500">DOM Size:</span> <span class="font-bold">${diag.domSizeDisplay || '-'}</span></div>
            <div class="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700/50"><span class="text-slate-500">Requests:</span> <span class="font-bold">${diag.networkRequests || '-'}</span></div>
            <div class="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700/50"><span class="text-slate-500">Total Weight:</span> <span class="font-bold">${diag.totalByteDisplay || '-'}</span></div>
            <div class="flex justify-between py-1"><span class="text-slate-500">Protocol:</span> <span class="font-bold">${data.httpProtocol || '-'}</span></div>
        `;
    }

    // 6. Screenshot
    if (data.screenshot) {
        document.getElementById('screenshotContainer').classList.remove('hidden');
        document.getElementById('screenshotImg').src = data.screenshot;
    }
}

// ============================================
// MODAL LOGIC
// ============================================

function showModal(id) {
    const modal = document.getElementById(id);
    const content = document.getElementById(id + 'Content');

    if (id === 'sslModal' && content) {
        const d = currentData.ssl || {};
        content.innerHTML = `
            <div class="grid grid-cols-2 gap-2">
                <span class="text-slate-500">Status:</span> <span>${d.valid ? 'Valid' : 'Invalid'}</span>
                <span class="text-slate-500">Issuer:</span> <span>${d.issuer || 'Unknown'}</span>
                <span class="text-slate-500">Valid From:</span> <span>${d.validFrom ? new Date(d.validFrom).toLocaleDateString() : '-'}</span>
                <span class="text-slate-500">Expires:</span> <span>${d.validTo ? new Date(d.validTo).toLocaleDateString() : '-'}</span>
                <span class="text-slate-500">Protocol:</span> <span>${d.protocol || '-'}</span>
                <span class="text-slate-500">Cipher:</span> <span>${d.cipher || '-'}</span>
                <span class="text-slate-500">Key:</span> <span>${d.keyType || ''} ${d.keySize || ''}</span>
            </div>
            ${d.vulnerabilities && (d.vulnerabilities.tls10 || d.vulnerabilities.tls11) ?
                `<div class="mt-4 p-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                    ⚠️ Vulnerability: Server supports deprecated TLS 1.0/1.1 protocols.
                </div>` : ''}
        `;
    }

    if (id === 'headersModal' && content) {
        const d = currentData.headers || {};
        let missingHtml = '';
        if (d.missing && d.missing.length > 0) {
            missingHtml = `<p class="text-red-600 dark:text-red-400 text-xs font-bold mb-2">Missing Recommended Headers:</p>`;
            d.missing.forEach(m => {
                missingHtml += `<div class="text-red-600 dark:text-red-300 text-sm mb-1 flex items-center gap-2">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    ${m.name}
                </div>`;
            });
        } else {
            missingHtml = `<div class="text-emerald-600 dark:text-emerald-400 text-sm flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                All core security headers are present!
            </div>`;
        }
        content.innerHTML = `
            <div class="mb-4 text-xs font-mono bg-slate-100 dark:bg-slate-900 p-2 rounded text-slate-700 dark:text-slate-300">Server: ${d.server || 'Hidden'}</div>
            ${missingHtml}
            <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <details>
                    <summary class="cursor-pointer text-blue-500 text-xs font-bold uppercase tracking-wider select-none">View Raw JSON</summary>
                    <pre class="mt-2 bg-slate-100 dark:bg-slate-900 p-3 rounded-lg text-xs overflow-auto max-h-64 text-slate-800 dark:text-slate-300 shadow-inner">${JSON.stringify(d, null, 2)}</pre>
                </details>
            </div>
        `;
    }

    if (id === 'portsModal' && content) {
        const d = currentData.ports || {};
        let html = '';
        if (d.open && d.open.length > 0) {
            d.open.forEach(p => {
                const isHighRisk = ['high', 'critical'].includes(p.risk);
                html += `<div class="flex justify-between bg-slate-100 dark:bg-slate-900 p-2 rounded mb-2 border ${isHighRisk ? 'border-red-400 dark:border-red-900' : 'border-slate-200 dark:border-slate-700'}">
                    <span class="text-slate-800 dark:text-white font-mono">Port ${p.port} <span class="text-slate-500 text-xs ml-2">(${p.service})</span></span>
                    <span class="${isHighRisk ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'} text-xs uppercase font-bold">${p.risk}</span>
                </div>`;
            });
        } else {
            html = `<div class="text-emerald-600 dark:text-emerald-400 text-sm">No common ports found open. This is excellent for security.</div>`;
        }
        content.innerHTML = html;
    }

    if (id === 'whoisModal' && content) {
        const d = currentData.whois || {};
        content.innerHTML = `
            <div class="grid grid-cols-2 gap-4 text-sm mb-4">
                <div><span class="text-slate-500 block text-xs">Registrar</span> <span class="font-semibold text-slate-800 dark:text-slate-200">${d.registrar || 'Unknown'}</span></div>
                <div><span class="text-slate-500 block text-xs">Domain Age</span> <span class="font-semibold text-slate-800 dark:text-slate-200">${d.domainAge ? `${d.domainAge} days` : 'Unknown'}</span></div>
                <div><span class="text-slate-500 block text-xs">Created Date</span> <span class="text-slate-800 dark:text-slate-300">${d.createdDate ? new Date(d.createdDate).toLocaleDateString() : '-'}</span></div>
                <div><span class="text-slate-500 block text-xs">Expiry Date</span> <span class="text-slate-800 dark:text-slate-300">${d.expiryDate ? new Date(d.expiryDate).toLocaleDateString() : '-'}</span></div>
                <div><span class="text-slate-500 block text-xs">Registrant Org</span> <span class="text-slate-800 dark:text-slate-300">${d.registrant?.org || '-'}</span></div>
                <div><span class="text-slate-500 block text-xs">Country</span> <span class="text-slate-800 dark:text-slate-300">${d.registrant?.country || '-'}</span></div>
            </div>
            ${d.nameServers?.length ? `
                <div class="border-t border-slate-200 dark:border-slate-700 pt-3">
                    <span class="text-slate-500 text-xs block mb-2">Name Servers:</span>
                    <div class="flex flex-wrap gap-2">
                        ${d.nameServers.map(ns => `<span class="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs px-2 py-1 rounded font-mono">${ns}</span>`).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    }

    if (id === 'dnsModal' && content) {
        const d = currentData.dns || {};

        const renderRecords = (title, records, colorCls, bgCls) => {
            if (!records || !records.length) return '';
            return `
                <div class="mb-4">
                    <span class="text-xs font-bold uppercase ${colorCls} block mb-1">${title}</span>
                    <div class="space-y-1">
                        ${records.map(rec => `<div class="${bgCls} p-2 rounded text-xs font-mono break-all border border-slate-100 dark:border-slate-800">${rec.value || rec.exchange || rec}</div>`).join('')}
                    </div>
                </div>
            `;
        };

        content.innerHTML = `
            <div class="grid grid-cols-2 gap-4 mb-4 border-b border-slate-200 dark:border-slate-700 pb-4">
                <div>
                    <span class="text-slate-500 block text-xs mb-1">DMARC Record</span>
                    ${d.emailSecurity?.dmarc?.exists ? '<span class="text-emerald-600 dark:text-emerald-400 font-bold text-sm">Present</span>' : '<span class="text-red-600 dark:text-red-400 font-bold text-sm">Missing</span>'}
                </div>
                <div>
                    <span class="text-slate-500 block text-xs mb-1">SPF Record</span>
                    ${d.emailSecurity?.spf?.exists ? '<span class="text-emerald-600 dark:text-emerald-400 font-bold text-sm">Present</span>' : '<span class="text-yellow-600 dark:text-yellow-400 font-bold text-sm">Missing</span>'}
                </div>
            </div>
            <div class="max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                ${renderRecords('A / AAAA (IPv4/IPv6)', [...(d.a || []), ...(d.aaaa || [])], 'text-blue-500', 'bg-blue-50 dark:bg-blue-900/10 dark:text-blue-300')}
                ${renderRecords('MX (Mail Servers)', d.mx, 'text-purple-500', 'bg-purple-50 dark:bg-purple-900/10 dark:text-purple-300')}
                ${renderRecords('CNAME (Aliases)', d.cname, 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/10 dark:text-emerald-300')}
                ${renderRecords('TXT (Text Records)', d.txt, 'text-slate-500', 'bg-slate-50 dark:bg-slate-800/50 dark:text-slate-300')}
            </div>
        `;
    }

    if (id === 'cookiesModal' && content) {
        const d = currentData.cookies || {};
        const isBad = d.overallRating === 'bad';
        const isWarn = d.overallRating === 'warning';

        content.innerHTML = `
            <div class="flex items-center gap-4 mb-4 p-3 rounded-lg ${isBad ? 'bg-red-50 dark:bg-red-900/20' : (isWarn ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20')}">
                <div class="text-2xl">${isBad ? '🚨' : (isWarn ? '⚠️' : '✅')}</div>
                <div>
                    <div class="font-bold ${isBad ? 'text-red-700 dark:text-red-400' : (isWarn ? 'text-yellow-700 dark:text-yellow-400' : 'text-emerald-700 dark:text-emerald-400')}">
                        ${d.totalCount} Cookies Detected
                    </div>
                    <div class="text-xs ${isBad ? 'text-red-600 dark:text-red-300' : (isWarn ? 'text-yellow-600 dark:text-yellow-300' : 'text-emerald-600 dark:text-emerald-300')}">
                        ${d.hasTrackingCookies ? 'Tracking cookies found.' : 'No major trackers detected.'}
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-3 gap-2 mb-4 text-center">
                <div class="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                    <div class="text-lg font-bold ${d.missingSecure > 0 ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}">${d.missingSecure || 0}</div>
                    <div class="text-[10px] uppercase text-slate-500">Missing Secure</div>
                </div>
                <div class="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                    <div class="text-lg font-bold ${d.missingHttpOnly > 0 ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}">${d.missingHttpOnly || 0}</div>
                    <div class="text-[10px] uppercase text-slate-500">Missing HttpOnly</div>
                </div>
                <div class="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                    <div class="text-lg font-bold ${d.missingSameSite > 0 ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}">${d.missingSameSite || 0}</div>
                    <div class="text-[10px] uppercase text-slate-500">Missing SameSite</div>
                </div>
            </div>

            <div class="text-xs text-slate-500 italic mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">Note: This only detects cookies set via HTTP response headers on the initial load. Client-side JS cookies require a Deep Scan.</div>
        `;
    }

    if (id === 'redirectsModal' && content) {
        const d = currentData.redirects || {};

        let chainHtml = '<div class="text-emerald-600 dark:text-emerald-400 text-sm">No redirects found. Directly serves target URL.</div>';

        if (d.chain && d.chain.length > 0) {
            chainHtml = '<div class="space-y-2 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 dark:before:via-slate-700 before:to-transparent">';
            d.chain.forEach((hop, i) => {
                const isLast = i === d.chain.length - 1;
                chainHtml += `
                    <div class="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div class="flex items-center justify-center w-5 h-5 rounded-full border-2 border-white dark:border-slate-900 bg-blue-500 text-slate-100 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-[10px]">
                            ${i + 1}
                        </div>
                        <div class="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm text-xs break-all">
                            <span class="text-slate-500 mb-1 block">Status: <span class="${hop.statusCode >= 400 ? 'text-red-500' : (hop.statusCode >= 300 ? 'text-blue-500' : 'text-emerald-500')} font-bold">${hop.statusCode}</span></span>
                            <span class="text-slate-800 dark:text-slate-200">${hop.url}</span>
                            ${hop.location ? `<div class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-slate-500 block">Redirects to: <br><span class="text-blue-600 dark:text-blue-400">${hop.location}</span></div>` : ''}
                        </div>
                    </div>
                `;
            });
            chainHtml += '</div>';
        }

        content.innerHTML = `
            <div class="flex justify-between items-center mb-6 bg-slate-100 dark:bg-slate-800/50 p-3 rounded-lg">
                <div>
                    <span class="text-[10px] uppercase text-slate-500 font-bold block">HTTP to HTTPS</span>
                    ${d.httpToHttps ? '<span class="text-emerald-600 dark:text-emerald-400 font-bold text-sm">Enforced</span>' : '<span class="text-red-600 dark:text-red-400 font-bold text-sm">Missing</span>'}
                </div>
                <div>
                    <span class="text-[10px] uppercase text-slate-500 font-bold block">Redirect Loop</span>
                    ${d.hasLoop ? '<span class="text-red-600 dark:text-red-400 font-bold text-sm">Detected</span>' : '<span class="text-emerald-600 dark:text-emerald-400 font-bold text-sm">None</span>'}
                </div>
                <div>
                    <span class="text-[10px] uppercase text-slate-500 font-bold block">Total Hops</span>
                    <span class="text-slate-800 dark:text-slate-200 font-bold text-sm">${d.totalHops || 0}</span>
                </div>
            </div>
            <div class="font-bold text-xs uppercase text-slate-500 mb-4">Redirection Trace</div>
            ${chainHtml}
        `;
    }

    if (id === 'mixedContentModal' && content) {
        const d = currentData.mixedContent || {};

        if (!d.hasMixedContent) {
            content.innerHTML = `
                <div class="flex flex-col items-center justify-center p-6 text-center">
                    <div class="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 rounded-full flex items-center justify-center text-3xl mb-4">🔒</div>
                    <h4 class="text-emerald-600 dark:text-emerald-400 font-bold text-lg">No Mixed Content Found</h4>
                    <p class="text-slate-500 text-sm mt-2">All resource references explicitly utilize secure HTTPS connections.</p>
                </div>
            `;
        } else {
            const types = Object.entries(d.byType || {}).filter(([_, count]) => count > 0);
            content.innerHTML = `
                <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 p-4 rounded-lg mb-4">
                    <h4 class="text-red-700 dark:text-red-400 font-bold flex items-center gap-2 mb-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> Insecure HTTP Resources Detected</h4>
                    <p class="text-red-600 dark:text-red-300 text-sm">Browsers may block or show warnings for this site because it loads insecure resources over a secure HTTPS connection.</p>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                    ${types.map(([type, count]) => `
                        <div class="bg-slate-50 dark:bg-slate-900 p-2 rounded text-center border border-slate-200 dark:border-slate-800">
                            <div class="text-red-500 font-bold text-lg">${count}</div>
                            <div class="text-[10px] uppercase text-slate-500">${type}</div>
                        </div>
                    `).join('')}
                </div>

                ${d.examples && d.examples.length ? `
                    <div class="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                        <span class="text-xs font-bold text-slate-500 uppercase mb-2 block">Examples of insecure resources:</span>
                        <ul class="list-disc pl-4 space-y-1 text-xs font-mono text-slate-700 dark:text-slate-300 break-all">
                            ${d.examples.map(ex => `<li>${ex}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            `;
        }
    }

    if (id === 'crawlerModal' && content) {
        const rob = currentData.robots || {};
        const sm = currentData.sitemap || {};

        content.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div class="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div class="text-xs font-bold uppercase text-slate-500 mb-3 flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Robots.txt</div>
                    ${rob.exists ? `
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between"><span class="text-slate-500">Status:</span> <span class="text-emerald-600 dark:text-emerald-400 font-bold">Present</span></div>
                            <div class="flex justify-between"><span class="text-slate-500">Access:</span> ${rob.isFullyBlocked ? '<span class="text-red-500 font-bold">Fully Blocked</span>' : '<span class="text-emerald-600 dark:text-emerald-400 font-bold">Allowed</span>'}</div>
                            <div class="flex justify-between"><span class="text-slate-500">Crawl Delay:</span> <span class="text-slate-800 dark:text-slate-200">${rob.crawlDelay ? `${rob.crawlDelay}s` : 'None'}</span></div>
                        </div>
                    ` : `
                        <div class="text-red-500 text-sm font-bold flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg> Missing</div>
                        <p class="text-xs text-slate-500 mt-2">Crawlers will assume full access to all paths.</p>
                    `}
                </div>

                <div class="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div class="text-xs font-bold uppercase text-slate-500 mb-3 flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg> Sitemap</div>
                    ${sm.exists ? `
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between"><span class="text-slate-500">Status:</span> <span class="text-emerald-600 dark:text-emerald-400 font-bold">Present</span></div>
                            <div class="flex justify-between"><span class="text-slate-500">Type:</span> <span class="text-slate-800 dark:text-slate-200">${sm.isSitemapIndex ? 'Sitemap Index' : 'Standard Sitemap'}</span></div>
                            <div class="flex justify-between"><span class="text-slate-500">URLs Found:</span> <span class="text-slate-800 dark:text-slate-200">${sm.urlCount || 0}</span></div>
                        </div>
                    ` : `
                        <div class="text-red-500 text-sm font-bold flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg> Not Found</div>
                        <p class="text-xs text-slate-500 mt-2">Search engines may have difficulty discovering all pages.</p>
                    `}
                </div>
            </div>

            ${sm.exists && sm.url ? `
                <div class="mt-2 border-t border-slate-200 dark:border-slate-700 pt-3">
                    <span class="text-[10px] uppercase text-slate-500 block mb-1">Sitemap Location</span>
                    <a href="${sm.url}" target="_blank" class="text-xs text-blue-500 hover:underline break-all font-mono">${sm.url}</a>
                </div>
            ` : ''}
        `;
    }

    if (id === 'a11yModal' && content) {
        const issues = currentTier2Data.a11yIssues || [];
        if (issues.length > 0) {
            let html = '<p class="text-red-600 dark:text-red-400 font-bold text-xs mb-2">Failing Checks:</p>';
            issues.forEach(iss => {
                html += `<div class="bg-red-50 dark:bg-red-900/10 p-2 rounded mb-2 border border-red-100 dark:border-red-900/30">
                    <div class="font-bold text-slate-800 dark:text-slate-200 text-xs">${iss.title}</div>
                    <div class="text-slate-600 dark:text-slate-400 text-xs mt-1">${iss.description || ''}</div>
                </div>`;
            });
            content.innerHTML = html;
        } else {
            content.innerHTML = `<div class="text-emerald-600 dark:text-emerald-400 text-sm flex items-center justify-center gap-2 py-4"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Perfect accessibility score! No critical issues found.</div>`;
        }
    }

    // Append Raw JSON toggle for all modals (except headers which handles its own)
    if (id !== 'headersModal' && content) {
        const keyMap = {
            'sslModal': 'ssl', 'portsModal': 'ports', 'whoisModal': 'whois',
            'dnsModal': 'dns', 'cookiesModal': 'cookies', 'redirectsModal': 'redirects',
            'mixedContentModal': 'mixedContent'
        };

        let rawData = null;
        if (id === 'a11yModal') {
            rawData = currentTier2Data.a11yIssues || [];
        } else if (id === 'crawlerModal') {
            rawData = { robots: currentData.robots, sitemap: currentData.sitemap };
        } else if (keyMap[id]) {
            rawData = currentData[keyMap[id]];
        }

        if (rawData) {
            content.innerHTML += `
                <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <details>
                        <summary class="cursor-pointer text-blue-500 text-xs font-bold uppercase tracking-wider select-none">View Raw JSON</summary>
                        <pre class="mt-2 bg-slate-100 dark:bg-slate-900 p-3 rounded-lg text-xs overflow-auto max-h-64 text-slate-800 dark:text-slate-300 shadow-inner">${JSON.stringify(rawData, null, 2)}</pre>
                    </details>
                </div>
            `;
        }
    }

    modal.showModal();
}

function closeModal(id) {
    document.getElementById(id).close();
}

document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });
});

// ============================================
// CLEANUP
// ============================================

window.addEventListener('beforeunload', () => {
    if (pollInterval) {
        clearInterval(pollInterval);
    }
});
