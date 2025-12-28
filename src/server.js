const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const { scanQueue } = require('./queues/scanQueue');
const logger = require('./utils/logger');

// Modules
const { checkSSL } = require('./modules/ssl');
const { checkHeaders } = require('./modules/headers');
const { checkPorts } = require('./modules/ports');
const { estimateCarbon } = require('./modules/carbon');
const { checkDNS } = require('./modules/dns');

const app = express();

app.set('trust proxy', 'loopback, linklocal, uniquelocal');

// [SECURITY] Restrict CORS in production (Optional: replace '*' with your actual domain)
app.use(cors({ origin: process.env.CORS_ORIGIN || 'https://audit.wiredalter.com' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// [SECURITY] Rate Limiter: 5 scans per minute per IP
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5,
    message: {
        error: 'Too many requests.',
        message: 'To protect our free infrastructure, we limit request frequency.'
    }
});
app.use('/api/scan', limiter);

// HELPER: Force any promise to fail after 'ms' milliseconds
const withTimeout = (promise, ms, name) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            logger.warn(`[TIMEOUT] ${name} took too long (> ${ms}ms). Skipping.`);
            reject(new Error('Request timed out'));
        }, ms);
    });

    return Promise.race([promise, timeoutPromise])
        .then((res) => {
            clearTimeout(timeoutId);
            return res;
        })
        .catch((err) => {
            clearTimeout(timeoutId);
            throw err;
        });
};

app.post('/api/scan', async (req, res) => {
    let { domain } = req.body;

    // [SECURITY] Strict Input Validation
    if (!domain || typeof domain !== 'string') return res.status(400).json({ error: 'Domain required' });

    // Clean input
    domain = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Validate valid domain format (prevents command injection risks)
    if (!validator.isFQDN(domain)) {
        return res.status(400).json({ error: 'Invalid domain format' });
    }

    try {
        const counts = await scanQueue.getJobCounts('active', 'waiting');

        // If there is ANY active job or ANY waiting job, reject the new request
        if (counts.active > 0 || counts.waiting > 0) {
            return res.status(503).json({
                error: 'Service is currently busy.',
                message: 'A scan is currently in progress. Please wait for your turn.',
                retryAfter: 10 // Hint to the client to try again in 10s
            });
        }

        logger.info(`Starting scan for: ${domain}`);

        // 1. Tier 1: Run Checks
        const results = await Promise.allSettled([
            withTimeout(checkSSL(domain), 5000, 'SSL'),
            withTimeout(checkHeaders(domain), 5000, 'Headers'),
            withTimeout(checkPorts(domain), 8000, 'Ports'),
            withTimeout(estimateCarbon(domain), 5000, 'Carbon'),
            withTimeout(checkDNS(domain), 5000, 'DNS')
        ]);

        const unwrap = (res) => res.status === 'fulfilled' ? res.value : { error: 'Check failed' };

        const tier1 = {
            ssl: unwrap(results[0]),
            headers: unwrap(results[1]),
            ports: unwrap(results[2]),
            carbon: unwrap(results[3]),
            dns: unwrap(results[4])
        };

        // 2. Queue Deep Scan
        // [PERFORMANCE] Job Options: Clean up Redis automatically
        const job = await scanQueue.add('deep-scan', { domain }, {
            removeOnComplete: 100, // Keep last 100 completed jobs
            removeOnFail: 500,     // Keep last 500 failed jobs for debugging
            attempts: 1            // Don't retry automatically (expensive)
        });

        logger.debug(`Job enqueued with ID: ${job.id}`);

        res.json({
            id: job.id,
            tier1: tier1,
            status: 'processing_tier_2'
        });

    } catch (error) {
        logger.error("Scan Error:", error.message);
        res.status(500).json({ error: 'Scan failed to initialize' });
    }
});

app.get('/api/scan/:id', async (req, res) => {
    const job = await scanQueue.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const state = await job.getState();
    const result = job.returnvalue;

    if (state === 'failed') {
        return res.json({ state, error: job.failedReason });
    }

    res.json({ state, result });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`Scanner Server running on port ${PORT}`));
