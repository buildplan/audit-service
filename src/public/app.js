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
        const timeoutId = setTimeout(() => controller.abort(), 30000);

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

async function triggerDeepScan() {
    const btn = document.getElementById('deepScanBtn');
    const errEl = document.getElementById('deepError');

    btn.disabled = true;
    btn.innerHTML = `<svg class="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Queuing...`;
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
    // Keeping terminal text colors standard for code clarity
    terminal.innerHTML = `
        <div class="text-slate-500 mb-1">$ init wiredalter-scanner --deep --target=${escapeHtml(domain)}</div>
        <div class="text-blue-400 mb-1">&gt; Spawning Headless Chrome... [OK]</div>
    `;

    pollDeepScan(scanId);
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
fetch('https://ip.wiredalter.com/api/info')
    .then(res => res.json())
    .then(data => {
        document.getElementById('my-ip').innerText = data.ip;
        document.getElementById('my-flag').innerText = getFlagEmoji(data.country_code || 'XX');
        document.getElementById('my-connection').classList.remove('hidden');
        startPlaceholderAnimation();
    })
    .catch(e => {
        console.log('IP check failed');
        startPlaceholderAnimation();
    });

function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '';
    const codePoints = countryCode.toUpperCase().split('').map(char =>  127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
}

// ============================================
// TIER 1 RENDERING
// ============================================

function renderTier1(data) {
    const sslEl = document.getElementById('sslStatus');
    const sslDet = document.getElementById('sslDetail');
    if (data.ssl.valid) {
        sslEl.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400">Valid</span>`;
        sslDet.textContent = `Expires in ${data.ssl.daysRemaining} days`;
    } else {
        sslEl.innerHTML = `<span class="text-red-600 dark:text-red-400">Invalid</span>`;
        sslDet.textContent = data.ssl.error || 'Certificate Error';
    }

    const gradeEl = document.getElementById('headerGrade');
    gradeEl.textContent = data.headers.grade;
    gradeEl.className = `text-4xl font-bold ${data.headers.grade === 'A' ? 'text-emerald-600 dark:text-emerald-400' : (data.headers.grade === 'F' ? 'text-red-600 dark:text-red-500' : 'text-yellow-600 dark:text-yellow-400')}`;
    document.getElementById('headerServer').textContent = data.headers.server;

    const portsEl = document.getElementById('portsStatus');
    if (data.ports.open && data.ports.open.length > 0) {
        portsEl.innerHTML = `<span class="text-yellow-600 dark:text-yellow-400">${data.ports.open.length} Ports Open</span>`;
    } else {
        portsEl.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400">All Common Closed</span>`;
    }

    document.getElementById('carbonAmount').textContent = `${data.carbon.co2}g`;
    document.getElementById('carbonGreen').innerHTML = data.carbon.green ?
        `<span class="text-emerald-600 dark:text-emerald-400">🌱 Green Hosting</span>` :
        `<span class="text-slate-500">Standard Hosting</span>`;
}

// ============================================
// DEEP SCAN POLLING
// ============================================

function addTerminalLog(msg) {
    const terminal = document.getElementById('scanTerminal');
    const logLine = document.createElement('div');
    logLine.className = 'text-emerald-400 mb-1'; // Keep terminal distinct
    logLine.textContent = `> ${msg}`;
    terminal.appendChild(logLine);
    terminal.scrollTop = terminal.scrollHeight;
}

async function pollDeepScan(id) {
    let ticks = 0;
    const maxTicks = 120;
    clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
        ticks++;

        if (ticks === 2) addTerminalLog("Analyzing Document Object Model (DOM)...");
        if (ticks === 4) addTerminalLog("Running Lighthouse Audits (Perf, SEO)...");
        if (ticks === 6) addTerminalLog("Fingerprinting Tech Stack (Wappalyzer)...");

        if (ticks > maxTicks) {
            clearInterval(pollInterval);
            document.getElementById('tier2Loading').innerHTML = `<div class="text-red-600 dark:text-red-400 p-4">Deep scan timed out. Tier 1 results are still valid.</div>`;
            enableScanButton();
            return;
        }

        try {
            const res = await fetch(`/api/scan/${id}`);

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

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

function renderTier2(data) {

    document.getElementById('tier2Loading').classList.add('hidden');
    document.getElementById('tier2Results').classList.remove('hidden');

    renderGauge('perfGauge', data.performance, document.getElementById('perfScore'));
    renderGauge('seoGauge', data.seo, document.getElementById('seoScore'));

    const techList = document.getElementById('techStackList');
    techList.innerHTML = '';

    if (data.tech && data.tech.length > 0) {
        data.tech.forEach(t => {
            const span = document.createElement('span');
            span.className = t.isLegacy ?
                "px-2 py-1 rounded-md border text-xs font-mono cursor-pointer bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700/50 text-yellow-700 dark:text-yellow-500" :
                "px-2 py-1 rounded-md border text-xs font-mono cursor-pointer bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300";
            span.textContent = t.name;

            if (t.isLegacy) {
                span.title = 'This technology was detected by ID only. Click for more info.';
                span.onclick = () => alert('This ID represents a proprietary technology or infrastructure detected by our 2025 signatures that does not yet have a public label in the legacy engine.');
            }

            techList.appendChild(span);
        });
    } else {
        const emptyMsg = document.createElement('span');
        emptyMsg.className = 'text-slate-500 text-xs';
        emptyMsg.textContent = 'No specific technologies detected.';
        techList.appendChild(emptyMsg);
    }

    if (data.screenshot) {
        document.getElementById('screenshotContainer').classList.remove('hidden');
        document.getElementById('screenshotImg').src = data.screenshot;
    }
}

function renderGauge(elementId, score, textElement) {
    const color = score >= 90 ? '#34d399' : (score >= 50 ? '#fbbf24' : '#ef4444');
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (score / 100) * circumference;

    document.getElementById(elementId).innerHTML = `
        <svg viewBox="0 0 100 100" class="w-full h-full">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#cbd5e1" stroke-opacity="0.3" stroke-width="8" />
            <circle cx="50" cy="50" r="45" fill="none" stroke="${color}" stroke-width="8"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                    class="circle-chart__circle" stroke-linecap="round" />
        </svg>
    `;
    textElement.textContent = Math.round(score);
    textElement.style.color = color;
}

// ============================================
// MODAL LOGIC
// ============================================

function showModal(id) {
    const modal = document.getElementById(id);

    if (id === 'sslModal') {
        const d = currentData.ssl;
        const content = document.getElementById('sslModalContent');
        content.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-2';

        const addRow = (label, value) => {
            const labelEl = document.createElement('span');
            labelEl.className = 'text-slate-500';
            labelEl.textContent = label + ':';

            const valueEl = document.createElement('span');
            valueEl.textContent = value;

            grid.appendChild(labelEl);
            grid.appendChild(valueEl);
        };

        addRow('Status', d.valid ? 'Valid' : 'Invalid');
        addRow('Issuer', d.issuer || 'Unknown');
        addRow('Valid From', d.validFrom ? new Date(d.validFrom).toLocaleDateString() : '-');
        addRow('Expires', d.validTo ? new Date(d.validTo).toLocaleDateString() : '-');

        content.appendChild(grid);
    }

    if (id === 'headersModal') {
        const d = currentData.headers;
        const content = document.getElementById('headersModalContent');
        content.innerHTML = '';

        const serverDiv = document.createElement('div');
        serverDiv.className = 'mb-4 text-xs font-mono bg-slate-100 dark:bg-slate-900 p-2 rounded text-slate-700 dark:text-slate-300';
        serverDiv.textContent = `Server: ${d.server}`;
        content.appendChild(serverDiv);

        if (d.missing && d.missing.length > 0) {
            const title = document.createElement('p');
            title.className = 'text-red-600 dark:text-red-400 text-xs font-bold mb-2';
            title.textContent = 'Missing Recommended Headers:';
            content.appendChild(title);

            d.missing.forEach(m => {
                const item = document.createElement('div');
                item.className = 'text-red-600 dark:text-red-300 text-sm mb-1 flex items-center gap-2';
                item.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
                const text = document.createTextNode(` ${m}`);
                item.appendChild(text);
                content.appendChild(item);
            });
        } else {
            const successDiv = document.createElement('div');
            successDiv.className = 'text-emerald-600 dark:text-emerald-400 text-sm flex items-center gap-2';
            successDiv.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
            const text = document.createTextNode(' All core security headers are present!');
            successDiv.appendChild(text);
            content.appendChild(successDiv);
        }
    }

    if (id === 'portsModal') {
        const d = currentData.ports;
        const content = document.getElementById('portsModalContent');
        content.innerHTML = '';

        if (d.open && d.open.length > 0) {
            d.open.forEach(p => {
                const portDiv = document.createElement('div');
                portDiv.className = 'flex justify-between bg-slate-100 dark:bg-slate-900 p-2 rounded mb-2 border border-red-200 dark:border-red-900/30';

                const portLabel = document.createElement('span');
                portLabel.className = 'text-slate-800 dark:text-white font-mono';
                portLabel.textContent = `Port ${p}`;

                const statusLabel = document.createElement('span');
                statusLabel.className = 'text-red-600 dark:text-red-400 text-xs uppercase font-bold';
                statusLabel.textContent = 'Open';

                portDiv.appendChild(portLabel);
                portDiv.appendChild(statusLabel);
                content.appendChild(portDiv);
            });
        } else {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'text-emerald-600 dark:text-emerald-400 text-sm';
            emptyDiv.textContent = 'No common ports found open (21, 22, 80, 443, 8080). This is good for security (stealth).';
            content.appendChild(emptyDiv);
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
