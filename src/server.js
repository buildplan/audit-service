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

// [SECURITY] Restrict CORS
const rawOrigins = process.env.CORS_ORIGIN || '';
const allowedOrigins = rawOrigins.split(',').map(o => o.trim()).filter(o => o);
const allowAll = allowedOrigins.includes('*');
logger.info(`[SECURITY] CORS Policy: ${allowAll ? 'Allow All (*)' : 'Strict Whitelist'}`);
if (!allowAll) logger.info(`[SECURITY] Whitelisted Origins: ${JSON.stringify(allowedOrigins)}`);
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowAll || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            logger.warn(`[CORS BLOCKED] Origin: '${origin}' is not in the whitelist.`);
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

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

// [ENDPOINT 1] Light Scan - Always available (Tier 1)
app.post('/api/scan', async (req, res) => {
    let { domain } = req.body;

    if (!domain || typeof domain !== 'string') return res.status(400).json({ error: 'Domain required' });
    domain = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!validator.isFQDN(domain)) return res.status(400).json({ error: 'Invalid domain format' });

    try {
        logger.info(`Starting Tier 1 scan for: ${domain}`);

        // Run Checks (Parallel)
        const results = await Promise.allSettled([
            withTimeout(checkSSL(domain), 5000, 'SSL'),
            withTimeout(checkHeaders(domain), 5000, 'Headers'),
            withTimeout(checkPorts(domain), 8000, 'Ports'),
            withTimeout(estimateCarbon(domain), 5000, 'Carbon'),
            withTimeout(checkDNS(domain), 5000, 'DNS')
        ]);

        const unwrap = (res) => res.status === 'fulfilled' ? res.value : { error: 'Check failed' };

        res.json({
            tier1: {
                ssl: unwrap(results[0]),
                headers: unwrap(results[1]),
                ports: unwrap(results[2]),
                carbon: unwrap(results[3]),
                dns: unwrap(results[4])
            }
        });

    } catch (error) {
        logger.error("Tier 1 Error:", error.message);
        res.status(500).json({ error: 'Scan failed to initialize' });
    }
});

// [ENDPOINT 2] Deep Scan - Limited Concurrency (Tier 2)
app.post('/api/scan/deep', async (req, res) => {
    let { domain } = req.body;

    // Validation
    if (!domain || typeof domain !== 'string') return res.status(400).json({ error: 'Domain required' });
    domain = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!validator.isFQDN(domain)) return res.status(400).json({ error: 'Invalid domain format' });

    try {
        // [GATEKEEPER] Check Worker Capacity
        const counts = await scanQueue.getJobCounts('active', 'waiting');

        // Strict Limit: If worker is busy, reject immediately
        if (counts.active > 0 || counts.waiting > 0) {
            return res.status(503).json({
                error: 'System Busy',
                message: 'Community Server Limit: A deep scan is already in progress. Please wait 30s or try again later.'
            });
        }

        // Add to Queue
        const job = await scanQueue.add('deep-scan', { domain }, {
            removeOnComplete: 100,
            removeOnFail: 500,
            attempts: 1
        });

        logger.info(`Deep scan queued for: ${domain} (ID: ${job.id})`);

        res.json({ id: job.id, status: 'queued' });

    } catch (error) {
        logger.error("Deep Scan Error:", error.message);
        res.status(500).json({ error: 'Failed to queue deep scan' });
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
