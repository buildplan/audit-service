const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer-core');
const WappalyzerCore = require('wappalyzer-core');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Global categories variable for cross-function access
let globalCategories = {};

console.log("\n\n#############################################");
console.log("###          scan.wiredalter.com        ###");
console.log("#############################################\n\n");

// ------------------------------------------
// 1. DATA SCHEMA TRANSLATOR (2025 -> 2021)
// ------------------------------------------
try {
    const wappalyzerPath = path.join(__dirname, '../utils/wappalyzer');
    const techPath = path.join(wappalyzerPath, 'technologies');
    const catPath = path.join(wappalyzerPath, 'categories.json');

    // Assign to the global variable
    globalCategories = JSON.parse(fs.readFileSync(catPath, 'utf8'));
    WappalyzerCore.setCategories(globalCategories);

    let mergedTechnologies = {};
    if (fs.existsSync(techPath)) {
        const files = fs.readdirSync(techPath).filter(file => file.endsWith('.json'));
        files.forEach(file => {
            const content = JSON.parse(fs.readFileSync(path.join(techPath, file), 'utf8'));
            Object.assign(mergedTechnologies, content);
        });
    }

    const translateToLegacy = (tech) => {
        const arrayFields = ['html', 'url', 'script', 'scriptSrc', 'scripts', 'css', 'js', 'meta'];
        arrayFields.forEach(field => {
            if (tech[field]) {
                if (typeof tech[field] === 'string') tech[field] = [tech[field]];
                else if (!Array.isArray(tech[field])) delete tech[field];
            }
        });

        if (tech.headers && typeof tech.headers === 'object') {
            Object.keys(tech.headers).forEach(key => {
                if (typeof tech.headers[key] === 'string') tech.headers[key] = [tech.headers[key]];
            });
        }

        delete tech.requires; delete tech.implies; delete tech.excludes;

        if (tech.versions) {
            if (Array.isArray(tech.versions)) tech.versions.forEach(v => translateToLegacy(v));
            else if (typeof tech.versions === 'object') Object.values(tech.versions).forEach(v => translateToLegacy(v));
        }
    };

    const techArray = Object.keys(mergedTechnologies).map(key => {
        const tech = { ...mergedTechnologies[key], name: key };
        translateToLegacy(tech);
        return tech;
    });

    WappalyzerCore.setTechnologies(techArray);
    logger.info(`[System] Translator complete. ${techArray.length} technologies ready.`);
} catch (e) {
    logger.error(`[CRITICAL] Translation Failed: ${e.message}`);
}

// ------------------------------------------
// 2. SCANNING LOGIC
// ------------------------------------------
async function runDeepScan(domain) {
    const url = `https://${domain}`;
    let chrome;
    let browser;
    let techResults = [];

    try {
        const lighthouse = (await import('lighthouse')).default;

        chrome = await chromeLauncher.launch({
            chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
            chromePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });

        const flags = {
            port: chrome.port,
            logLevel: 'error',
            output: 'json',
            onlyCategories: ['performance', 'seo', 'accessibility']
        };

        const config = {
            extends: 'lighthouse:default',
            settings: {
                formFactor: 'desktop',
                screenEmulation: {
                    mobile: false,
                    width: 1350,
                    height: 940,
                    deviceScaleFactor: 1,
                    disabled: false,
                },
                emulatedUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
                throttlingMethod: 'simulate',
            }
        };

        const runnerResult = await lighthouse(url, flags, config);

        const report = runnerResult.lhr;

        try {
            const resp = await fetch(`http://127.0.0.1:${chrome.port}/json/version`);
            const { webSocketDebuggerUrl } = await resp.json();
            browser = await puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl });
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });

            const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

            const rawHeaders = response ? response.headers() : {};
            const normalizedHeaders = {};
            Object.keys(rawHeaders).forEach(key => {
                const value = Array.isArray(rawHeaders[key]) ? rawHeaders[key][0] : rawHeaders[key];
                normalizedHeaders[key.toLowerCase()] = [value];
            });

            const detections = await WappalyzerCore.analyze({
                url,
                html: await page.content(),
                headers: normalizedHeaders,
                meta: await page.evaluate(() => {
                    const m = {};
                    document.querySelectorAll('meta').forEach(el => {
                        const name = el.getAttribute('name') || el.getAttribute('property');
                        if (name) m[name.toLowerCase()] = [el.getAttribute('content')];
                    });
                    return m;
                }),
                scripts: await page.evaluate(() => Array.from(document.scripts).map(s => s.src).filter(Boolean))
            });

            const resolvedTechs = WappalyzerCore.resolve(detections);

            const manualMappings = {
                "1221": "Cloudflare",
                "2630": "HSTS / Security",
                "2544": "Google Web Server"
            };

            techResults = resolvedTechs.map(t => {
                const isLegacyId = !isNaN(t.name) && t.name !== '';

                let displayName = t.name;

                if (isLegacyId && manualMappings[t.name]) {
                    displayName = manualMappings[t.name];
                } else {
                    displayName = t.slug || t.name;
                }

                return {
                    name: displayName,
                    isLegacy: isLegacyId,
                    categories: t.categories ? t.categories.map(c => {
                        const catId = typeof c === 'object' ? c.id : c;
                        return globalCategories[catId]?.name || c.name || c;
                    }) : [],
                    confidence: t.confidence
                };
            });

            await page.close();
        } catch (coreError) {
            logger.error(`Analysis Failed: ${coreError.message}`);
        }

        return {
            performance: (report.categories.performance.score || 0) * 100,
            seo: (report.categories.seo.score || 0) * 100,
            accessibility: (report.categories.accessibility.score || 0) * 100,
            screenshot: report.audits['final-screenshot']?.details?.data || null,
            tech: techResults
        };

    } finally {
        if (browser) await browser.disconnect();
        if (chrome) await chrome.kill();
    }
}

module.exports = { runDeepScan };
