const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer-core');
const WappalyzerCore = require('../utils/wappalyzer/engine');
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
// 2. HELPER: Extract detailed Lighthouse data
// ------------------------------------------
function extractLighthouseDetails(report) {
    const audits = report.audits || {};

    // Core Web Vitals
    const coreWebVitals = {
        lcp: {
            value: audits['largest-contentful-paint']?.numericValue || null,
            displayValue: audits['largest-contentful-paint']?.displayValue || null,
            score: audits['largest-contentful-paint']?.score ?? null,
        },
        fcp: {
            value: audits['first-contentful-paint']?.numericValue || null,
            displayValue: audits['first-contentful-paint']?.displayValue || null,
            score: audits['first-contentful-paint']?.score ?? null,
        },
        cls: {
            value: audits['cumulative-layout-shift']?.numericValue || null,
            displayValue: audits['cumulative-layout-shift']?.displayValue || null,
            score: audits['cumulative-layout-shift']?.score ?? null,
        },
        tbt: {
            value: audits['total-blocking-time']?.numericValue || null,
            displayValue: audits['total-blocking-time']?.displayValue || null,
            score: audits['total-blocking-time']?.score ?? null,
        },
        si: {
            value: audits['speed-index']?.numericValue || null,
            displayValue: audits['speed-index']?.displayValue || null,
            score: audits['speed-index']?.score ?? null,
        },
        tti: {
            value: audits['interactive']?.numericValue || null,
            displayValue: audits['interactive']?.displayValue || null,
            score: audits['interactive']?.score ?? null,
        },
    };

    // Performance breakdown: resource sizes
    const resourceSummary = audits['resource-summary']?.details?.items || [];
    const resources = {};
    resourceSummary.forEach(item => {
        resources[item.resourceType || item.label] = {
            count: item.requestCount || 0,
            size: item.transferSize || item.size || 0,
        };
    });

    // Diagnostics
    const diagnostics = {
        domSize: audits['dom-size']?.numericValue || null,
        domSizeDisplay: audits['dom-size']?.displayValue || null,
        mainThreadWork: audits['mainthread-work-breakdown']?.numericValue || null,
        mainThreadDisplay: audits['mainthread-work-breakdown']?.displayValue || null,
        bootupTime: audits['bootup-time']?.numericValue || null,
        bootupDisplay: audits['bootup-time']?.displayValue || null,
        totalByteWeight: audits['total-byte-weight']?.numericValue || null,
        totalByteDisplay: audits['total-byte-weight']?.displayValue || null,
        serverResponseTime: audits['server-response-time']?.numericValue || null,
        serverResponseDisplay: audits['server-response-time']?.displayValue || null,
        networkRequests: audits['network-requests']?.details?.items?.length || null,
        thirdPartyCount: audits['third-party-summary']?.details?.items?.length || 0,
    };

    // SEO details: extract individual audit results
    const seoAudits = [];
    const seoCategory = report.categories?.seo;
    if (seoCategory?.auditRefs) {
        seoCategory.auditRefs.forEach(ref => {
            const audit = audits[ref.id];
            if (audit) {
                seoAudits.push({
                    id: ref.id,
                    title: audit.title,
                    score: audit.score,
                    displayValue: audit.displayValue || null,
                    description: audit.description?.split('[Learn')[0]?.trim() || null,
                });
            }
        });
    }

    // Accessibility details: extract failing audits
    const a11yAudits = [];
    const a11yCategory = report.categories?.accessibility;
    if (a11yCategory?.auditRefs) {
        a11yCategory.auditRefs.forEach(ref => {
            const audit = audits[ref.id];
            if (audit && audit.score !== null && audit.score < 1) {
                a11yAudits.push({
                    id: ref.id,
                    title: audit.title,
                    score: audit.score,
                    description: audit.description?.split('[Learn')[0]?.trim() || null,
                    details: audit.details?.items?.length || 0,
                });
            }
        });
    }

    // Performance opportunities
    const opportunities = [];
    const perfCategory = report.categories?.performance;
    if (perfCategory?.auditRefs) {
        perfCategory.auditRefs
            .filter(ref => ref.group === 'load-opportunities')
            .forEach(ref => {
                const audit = audits[ref.id];
                if (audit && audit.score !== null && audit.score < 1) {
                    opportunities.push({
                        id: ref.id,
                        title: audit.title,
                        score: audit.score,
                        displayValue: audit.displayValue || null,
                        numericValue: audit.numericValue || null,
                        savings: audit.details?.overallSavingsMs || null,
                    });
                }
            });
    }

    // Best Practices (if available)
    const bestPracticesScore = report.categories?.['best-practices']?.score ?? null;

    return {
        coreWebVitals,
        resources,
        diagnostics,
        seoAudits,
        a11yAudits,
        opportunities,
        bestPracticesScore,
    };
}

// ------------------------------------------
// 3. HELPER: Extract page analysis via Puppeteer
// ------------------------------------------
async function analyzePage(page, url) {
    const result = {};

    try {
        // Meta tags analysis
        result.metaTags = await page.evaluate(() => {
            const tags = {};

            // Standard meta tags
            const metaEls = document.querySelectorAll('meta');
            metaEls.forEach(el => {
                const name = el.getAttribute('name') || el.getAttribute('property') || el.getAttribute('http-equiv');
                const content = el.getAttribute('content');
                if (name && content) tags[name.toLowerCase()] = content;
            });

            // Title
            tags['title'] = document.title || null;

            // Canonical
            const canonical = document.querySelector('link[rel="canonical"]');
            tags['canonical'] = canonical ? canonical.getAttribute('href') : null;

            // Language
            tags['language'] = document.documentElement.lang || null;

            // Structured data
            const ldJsonScripts = document.querySelectorAll('script[type="application/ld+json"]');
            tags['hasStructuredData'] = ldJsonScripts.length > 0;
            tags['structuredDataCount'] = ldJsonScripts.length;

            return tags;
        });

        // Open Graph tags
        result.openGraph = await page.evaluate(() => {
            const og = {};
            document.querySelectorAll('meta[property^="og:"]').forEach(el => {
                og[el.getAttribute('property')] = el.getAttribute('content');
            });
            return Object.keys(og).length > 0 ? og : null;
        });

        // Twitter Card tags
        result.twitterCard = await page.evaluate(() => {
            const tw = {};
            document.querySelectorAll('meta[name^="twitter:"]').forEach(el => {
                tw[el.getAttribute('name')] = el.getAttribute('content');
            });
            return Object.keys(tw).length > 0 ? tw : null;
        });

        // Resource hints
        result.resourceHints = await page.evaluate(() => {
            const hints = { preload: [], prefetch: [], preconnect: [], dnsPrefetch: [] };
            document.querySelectorAll('link[rel="preload"]').forEach(el => {
                hints.preload.push({ href: el.getAttribute('href'), as: el.getAttribute('as') });
            });
            document.querySelectorAll('link[rel="prefetch"]').forEach(el => {
                hints.prefetch.push(el.getAttribute('href'));
            });
            document.querySelectorAll('link[rel="preconnect"]').forEach(el => {
                hints.preconnect.push(el.getAttribute('href'));
            });
            document.querySelectorAll('link[rel="dns-prefetch"]').forEach(el => {
                hints.dnsPrefetch.push(el.getAttribute('href'));
            });
            return hints;
        });

        // Font analysis
        result.fonts = await page.evaluate(() => {
            const fonts = [];
            document.querySelectorAll('link[rel="stylesheet"][href*="fonts"], link[as="font"]').forEach(el => {
                fonts.push(el.getAttribute('href'));
            });
            // Check font-display in any inline styles
            const styleSheets = document.querySelectorAll('style');
            let hasFontDisplay = false;
            styleSheets.forEach(s => {
                if (s.textContent.includes('font-display')) hasFontDisplay = true;
            });
            return { count: fonts.length, urls: fonts.slice(0, 5), hasFontDisplay };
        });

        // DOM statistics
        result.domStats = await page.evaluate(() => {
            const allElements = document.querySelectorAll('*');
            const images = document.querySelectorAll('img');
            const imagesWithoutAlt = document.querySelectorAll('img:not([alt])');
            const links = document.querySelectorAll('a');
            const externalLinks = Array.from(links).filter(a => {
                try { return new URL(a.href).hostname !== window.location.hostname; } catch { return false; }
            });
            const forms = document.querySelectorAll('form');
            const iframes = document.querySelectorAll('iframe');

            return {
                totalElements: allElements.length,
                images: images.length,
                imagesWithoutAlt: imagesWithoutAlt.length,
                links: links.length,
                externalLinks: externalLinks.length,
                forms: forms.length,
                iframes: iframes.length,
            };
        });

    } catch (err) {
        logger.warn(`[PageAnalysis] Partial failure: ${err.message}`);
    }

    return result;
}

// ------------------------------------------
// 4. MAIN SCANNING LOGIC
// ------------------------------------------
async function runDeepScan(domain) {
    const url = `https://${domain}`;
    let chrome;
    let browser;
    let techResults = [];
    let consoleErrors = [];
    let pageAnalysis = {};
    let httpProtocol = null;

    try {
        const lighthouse = (await import('lighthouse')).default;

        chrome = await chromeLauncher.launch({
            chromeFlags: [
                '--headless=new',
                '--no-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--disable-software-rasterizer',
                '--no-zygote'
            ],
            chromePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });

        const flags = {
            port: chrome.port,
            logLevel: 'error',
            output: 'json',
            onlyCategories: ['performance', 'seo', 'accessibility', 'best-practices']
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
                emulatedUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                throttlingMethod: 'simulate',
            }
        };

        const runnerResult = await lighthouse(url, flags, config);
        const report = runnerResult.lhr;

        // Extract detailed lighthouse data
        const lighthouseDetails = extractLighthouseDetails(report);

        // ------------------------------------------
        // Puppeteer phase: tech detection + page analysis
        // ------------------------------------------
        try {
            const resp = await fetch(`http://127.0.0.1:${chrome.port}/json/version`);
            const { webSocketDebuggerUrl } = await resp.json();
            browser = await puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl });
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });

            // Capture console errors
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    consoleErrors.push(msg.text().substring(0, 200));
                }
            });

            const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // Detect HTTP protocol version
            if (response) {
                try {
                    const secInfo = response.securityDetails();
                    if (secInfo) {
                        httpProtocol = secInfo.protocol() || null;
                    }
                } catch { /* not all pages have security details */ }
            }

            // Normalize headers for Wappalyzer
            const rawHeaders = response ? response.headers() : {};
            const normalizedHeaders = {};
            Object.keys(rawHeaders).forEach(key => {
                const value = Array.isArray(rawHeaders[key]) ? rawHeaders[key][0] : rawHeaders[key];
                normalizedHeaders[key.toLowerCase()] = [value];
            });

            // Run Wappalyzer tech detection
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

            techResults = resolvedTechs.map(t => {
                const isLegacyId = !isNaN(t.name) && t.name !== '';

                return {
                    name: t.name,
                    slug: t.slug || null,
                    isLegacy: isLegacyId,
                    version: t.version || null,
                    icon: t.icon || null,
                    website: t.website || null,
                    categories: t.categories ? t.categories.map(c => {
                        const catId = typeof c === 'object' ? c.id : c;
                        return {
                            id: catId,
                            name: globalCategories[catId]?.name || c.name || String(c),
                        };
                    }) : [],
                    confidence: t.confidence
                };
            }).filter(t => !t.isLegacy || t.confidence >= 50); // Filter low-confidence legacy IDs

            // Run page analysis
            pageAnalysis = await analyzePage(page, url);

            await page.close();
        } catch (coreError) {
            logger.error(`Analysis Failed: ${coreError.message}`);
        }

        // Determine screenshot location (compatible with both v11 and newer versions)
        const screenshot = report.audits['final-screenshot']?.details?.data
            || report.audits['full-page-screenshot']?.details?.screenshot?.data
            || report.fullPageScreenshot?.screenshot?.data
            || null;

        return {
            // Category scores
            performance: (report.categories.performance?.score || 0) * 100,
            seo: (report.categories.seo?.score || 0) * 100,
            accessibility: (report.categories.accessibility?.score || 0) * 100,
            bestPractices: (report.categories['best-practices']?.score || 0) * 100,

            // Core Web Vitals
            coreWebVitals: lighthouseDetails.coreWebVitals,

            // Detailed audit results
            seoAudits: lighthouseDetails.seoAudits,
            a11yIssues: lighthouseDetails.a11yAudits,
            opportunities: lighthouseDetails.opportunities,

            // Performance diagnostics
            diagnostics: lighthouseDetails.diagnostics,
            resources: lighthouseDetails.resources,

            // Page analysis
            metaTags: pageAnalysis.metaTags || null,
            openGraph: pageAnalysis.openGraph || null,
            twitterCard: pageAnalysis.twitterCard || null,
            resourceHints: pageAnalysis.resourceHints || null,
            fonts: pageAnalysis.fonts || null,
            domStats: pageAnalysis.domStats || null,

            // Console & protocol
            consoleErrors: consoleErrors.slice(0, 10),
            httpProtocol,

            // Screenshot
            screenshot,

            // Tech stack
            tech: techResults
        };

    } finally {
        if (browser) await browser.disconnect();
        if (chrome) await chrome.kill();
    }
}

module.exports = { runDeepScan };
