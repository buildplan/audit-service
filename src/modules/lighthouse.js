const chromeLauncher = require('chrome-launcher');
const Wappalyzer = require('wappalyzer');
const logger = require('../utils/logger');

async function runDeepScan(domain) {
    const url = `https://${domain}`;
    let chrome;
    let techResults = [];

    try {
        // Dynamic Import for Lighthouse
        const lighthouse = (await import('lighthouse')).default;

        // 1. Launch Chrome for Lighthouse
        // Launch this manually to control the port and flags
        logger.debug(`Launching Chrome for Lighthouse (${domain})...`);
        chrome = await chromeLauncher.launch({
            chromeFlags: [
                '--headless',
                '--no-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox'
            ],
            chromePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });

        // 2. Run Lighthouse
        const options = {
            logLevel: logger.getLighthouseLevel ? logger.getLighthouseLevel() : 'error',
            output: 'json',
            onlyCategories: ['performance', 'seo', 'accessibility'],
            port: chrome.port
        };

        logger.info(`Lighthouse started for ${domain}`);
        const runnerResult = await lighthouse(url, options);
        const report = runnerResult.lhr;

        // [CRITICAL] Kill the Lighthouse Chrome instance.
        // If we don't, we might run out of RAM when Wappalyzer launches its own.
        await chrome.kill();
        chrome = null;

        // 3. Run Wappalyzer (Tech Stack)
        logger.info(`Wappalyzer analyzing ${domain}...`);

        // Explicitly configure Puppeteer for Wappalyzer
        // This ensures it uses the installed Google Chrome with Docker-safe flags
        const wappalyzer = new Wappalyzer({
            debug: false,
            delay: 1000,
            recursive: false,
            puppeteerOptions: {
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--headless',
                    '--disable-gpu',
                    '--disable-dev-shm-usage'
                ]
            }
        });

        try {
            await wappalyzer.init();
            const site = await wappalyzer.open(url);

            const results = await site.analyze();

            // Format the results into a cleaner array
            techResults = results.technologies ? results.technologies.map(t => ({
                name: t.name,
                categories: t.categories.map(c => c.name),
                confidence: t.confidence
            })) : [];

            await wappalyzer.destroy();
        } catch (wappError) {
            // If Wappalyzer fails, log it but DON'T crash the whole scan.
            // Return the Lighthouse data at least.
            logger.error(`Wappalyzer failed: ${wappError.message}`);
        }

        // 4. Return Combined Data
        return {
            performance: report.categories.performance.score * 100,
            seo: report.categories.seo.score * 100,
            accessibility: report.categories.accessibility.score * 100,
            screenshot: report.audits['final-screenshot']?.details?.data,
            tech: techResults
        };

    } catch (error) {
        logger.error(`Deep Scan Failed for ${domain}:`, error.message);
        throw error;
    } finally {
        // Safety net: ensure Chrome is dead if the script crashed early
        if (chrome) await chrome.kill();
    }
}

module.exports = { runDeepScan };
