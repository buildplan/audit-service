# WiredAlter Audit Service

A web intelligence platform that performs deep infrastructure audits. It combines **Google Lighthouse** performance metrics, **Wappalyzer** technology stack fingerprinting, and real-time security analysis (SSL/Headers/Ports) into a single report.

## Features

* **Multi-Stage Audit Engine:**

* **Tier 1 (Instant):** SSL certificate validation, HTTP Security Headers (CSP, HSTS), Open Port scanning, and Carbon Footprint analysis.

* **Tier 2 (Deep):** Spawns a headless Chromium instance to render the DOM, run Google Lighthouse (SEO, Performance, Accessibility), and fingerprint the technology stack.

* **Modern Tech Detection:** Utilizes the **Wappalyzer** signature dataset (maintained by Enthec) with a custom compatibility layer to bridge modern JSON schemas with the stable legacy detection engine.

* **Infrastructure Privacy:** Uses a distributed worker architecture (BullMQ + Valkey) to decouple the web server from the heavy scanning logic.

* **Enterprise-Grade Reporting:** Generates high-resolution screenshots and detailed "Desktop" view reports, overriding default mobile emulations.

* **Production Ready:** Dockerized with `dumb-init` for zombie process management, secured with rate limiting, and served via a clean, split frontend architecture.

## Usage

### Web Interface

Visit the portal at [audit.wiredalter.com](https://audit.wiredalter.com). Enter a domain (e.g., `google.com`) to receive a comprehensive audit report including:

* **Performance Score (0-100)**
* **SEO & Accessibility Ratings**
* **Detailed Technology Stack (CMS, Analytics, Frameworks)**
* **Live Desktop Preview**

### API Access

Developers can programmatically trigger scans and retrieve JSON results. Note that deep scans are asynchronous due to their complexity.

**1. Initiate Scan:**

```bash
curl -X POST https://audit.wiredalter.com/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain": "example.com"}'
```

*Returns a Job ID (`id`) and immediate Tier 1 results.*

**2. Poll for Results:**

```bash
curl https://audit.wiredalter.com/api/scan/{job_id}
```

*Returns the final Lighthouse metrics and Wappalyzer stack data once the worker completes.*

## Architecture

This project uses a decoupled microservices architecture to ensure stability under load.

* **Web Server (`scan-web`):** A lightweight Express.js server that handles API requests, serves the static frontend, runs instant "Tier 1" checks (SSL/Headers), and dispatches deep scan jobs to the queue.
* **Worker Node (`scan-worker`):** A heavy-lifting Node.js consumer that runs `puppeteer-core` and `lighthouse`. It connects to a local Valkey (Redis) instance to pick up jobs.
* **Queue (`valkey`):** A high-performance in-memory datastore (fork of Redis) used by BullMQ for reliable job management.

## Installation (Self-Hosted)

### Prerequisites

* Docker & Docker Compose
* Basic knowledge of `git` and `bash`

### 1. Clone the Repository

```bash
git clone https://github.com/buildplan/audit-service.git
cd audit-service
```

### 2. Prepare Data Files

To comply with licensing and functionality, you must populate the `src/utils/wappalyzer` directory with the necessary datasets from the Enthec repository:

* `technologies/` (Folder containing `.json` signature files)
* `categories.json` (Category mapping file)

*Note: The project includes a custom "Schema Translator" that automatically converts modern 2025 signatures to be compatible with the legacy v6 engine used for stability.*

### 3. Run with Docker

**Option 1: Quick Start (Pre-built)**
If you are using the official WiredAlter images:

```bash
docker compose up -d
```

**Option 2: Build from Source (Recommended)**
This ensures you are using the latest Chromium versions and your local frontend customizations.

```bash
docker compose up -d --build
```

### Configuration (Environment Variables)

Create a `.env` file in the root directory if you need to override defaults:

```env
PORT=3000
REDIS_HOST=valkey
REDIS_PORT=6379
# Concurrent scans per worker
CONCURRENCY=2
```

## Docker Configuration

This project uses a multi-stage `Dockerfile` to optimize image size and security. It specifically uses the **Debian Trixie** base to ensure compatibility with the latest Chromium builds.

**Key Docker Features:**

* **`dumb-init`**: Used as the entrypoint to prevent "zombie" Chrome processes from consuming memory after a scan timeout.
* **Chromium**: We use the distribution's native `chromium` package instead of downloading Chrome via Puppeteer to ensure security patches and smaller image sizes.
* **Non-Root User**: All processes run as the restricted `node` user for security.

## License & Attributions

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

* **Audit Engine:** Powered by [Google Lighthouse](https://github.com/GoogleChrome/lighthouse) (Apache 2.0).
* **Technology Detection:** Utilizes the [WebAppAnalyzer](https://github.com/enthec/webappanalyzer) signature dataset maintained by Enthec (GPL-3.0).
* **Geolocation:** Includes GeoLite2 data created by MaxMind, available from [https://www.maxmind.com](https://www.maxmind.com).
* **Browser Automation:** Powered by [Puppeteer](https://pptr.dev/) (Apache 2.0).

As this project links against GPL-3.0 licensed code (specifically the signatures and logic from WebAppAnalyzer), the entire codebase is distributed under the same terms.

© 2025 WiredAlter.com
