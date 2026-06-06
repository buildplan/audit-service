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
    const codePoints = countryCode.toUpperCase().split('').map(char =>  127397 + char.charCodeAt());
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
            headers: {'Content-Type': 'application/json'},
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
            headers: {'Content-Type': 'application/json'},
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

function renderGauge(elementId, score, textElement) {
    const color = score >= 90 ? '#34d399' : (score >= 50 ? '#fbbf24' : '#ef4444');
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (score / 100) * circumference;

    document.getElementById(elementId).innerHTML = `
        <svg viewBox="0 0 100 100" class="w-full h-full transform -rotate-90">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#cbd5e1" stroke-opacity="0.3" stroke-width="8" />
            <circle cx="50" cy="50" r="45" fill="none" stroke="${color}" stroke-width="8"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                    class="circle-chart__circle transition-all duration-1000 ease-out" stroke-linecap="round" />
        </svg>
    `;
    textElement.textContent = Math.round(score);
    textElement.style.color = color;
}

let currentTier2Data = {};

function renderTier2(data) {
    currentTier2Data = data;
    document.getElementById('tier2Loading').classList.add('hidden');
    document.getElementById('tier2Results').classList.remove('hidden');

    const colorize = (score) => score >= 90 ? '#34d399' : (score >= 50 ? '#fbbf24' : '#ef4444');

    // 1. Gauges
    renderGauge('perfGauge', data.performance, document.getElementById('scorePerf'));
    renderGauge('seoGauge', data.seo, document.getElementById('scoreSeo'));

    // 2. A11y & BP (if they exist in layout, else ignore)
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
            <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700"><details><summary class="cursor-pointer text-blue-500 text-xs">View Raw JSON</summary><pre class="mt-2 bg-slate-100 dark:bg-slate-900 p-2 rounded text-xs">${JSON.stringify(d, null, 2)}</pre></details></div>
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

    // Generic JSON dump fallback for new modals
    const genericModals = ['whoisModal', 'dnsModal', 'cookiesModal', 'redirectsModal', 'mixedContentModal', 'crawlerModal', 'a11yModal'];
    if (genericModals.includes(id) && content) {
        if (id === 'a11yModal') {
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
                content.innerHTML = `<div class="text-emerald-600 dark:text-emerald-400 text-sm">Perfect accessibility score! No issues found.</div>`;
            }
        } else {
            const keyMap = {
                'whoisModal': 'whois', 'dnsModal': 'dns', 'cookiesModal': 'cookies', 
                'redirectsModal': 'redirects', 'mixedContentModal': 'mixedContent', 'crawlerModal': 'robots'
            };
            const dataKey = keyMap[id];
            let displayData = dataKey ? currentData[dataKey] : {};
            
            // special case for crawler (combine robots and sitemap)
            if (id === 'crawlerModal') {
                displayData = { robots: currentData.robots, sitemap: currentData.sitemap };
            }

            content.innerHTML = `<pre class="bg-slate-100 dark:bg-slate-900 p-4 rounded text-xs overflow-auto">${JSON.stringify(displayData, null, 2)}</pre>`;
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
