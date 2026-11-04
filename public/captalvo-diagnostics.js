// ==============================================================================
// CAPTALVO DIAGNOSTICS & TELEMETRY — Full Observability & LGPD Consent
// ==============================================================================

'use strict';

class CaptalvoConsentManager {
    constructor() {
        this.STORAGE_KEY = 'captalvo_telemetry_consent';
        this.consent = this.loadConsent();
    }

    loadConsent() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return {
            essentialTechnical: true,    // Always true for engine diagnostics
            performanceMetrics: true,    // FPS, frametimes, disk latency
            hardwareProfile: true,       // GPU, CPU, display info
            advancedTrace: false,        // High-resolution temporary trace
            updatedAt: new Date().toISOString()
        };
    }

    saveConsent(settings) {
        this.consent = {
            ...this.consent,
            ...settings,
            essentialTechnical: true, // Non-revocable essential technical diagnostics
            updatedAt: new Date().toISOString()
        };
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.consent));
        } catch (e) {}
    }

    isAllowed(category) {
        if (category === 'essentialTechnical') return true;
        return !!this.consent[category];
    }
}

class CaptalvoDiagnosticsSystem {
    constructor() {
        this.consent = new CaptalvoConsentManager();
        this.sessionId = this.getOrCreateSessionId();

        // File I/O logs & aggregations
        this.fileOperations = []; // Recent operations ring buffer
        this.fileStats = new Map(); // Map<filename, { reads, bytes, hits, misses, latencies: [], waitMs }>

        // Engine lifecycle & frametime metrics
        this.engineMetrics = {
            initStartMs: null,
            vfsInitDurationMs: null,
            mountedFilesCount: 0,
            firstFrameMs: null,
            menuReadyMs: null,
            currentFps: 0,
            avgFps: 0,
            minFps: 0,
            onePercentLowFps: 0,
            freezes: {
                count100ms: 0,
                count200ms: 0,
                count500ms: 0,
                count1000ms: 0,
                recentEvents: []
            }
        };

        // Outbound telemetry queue
        this.telemetryQueue = [];
        this.isFlushing = false;
        this.flushTimer = null;
        this.retryCount = 0;

        this.init();
    }

    getOrCreateSessionId() {
        try {
            let id = sessionStorage.getItem('captalvo_session_id');
            if (!id) {
                id = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
                sessionStorage.setItem('captalvo_session_id', id);
            }
            return id;
        } catch (e) {
            return 'sess_' + Date.now().toString(36);
        }
    }

    init() {
        // Enforce 60-second automatic flush rule
        if (this.flushTimer) clearInterval(this.flushTimer);
        this.flushTimer = setInterval(() => this.flush(), 60000);
        if (this.flushTimer && typeof this.flushTimer.unref === 'function') {
            this.flushTimer.unref();
        }

        // Page visibility & unload beacon flush
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) this.flushBeacon();
            });
            window.addEventListener('pagehide', () => this.flushBeacon());
        }

        console.log(`[CaptalvoDiagnostics] Observabilidade ativa. Sessão: ${this.sessionId} (Envio a cada 60s)`);
    }

    recordFileOperation(op) {
        // Ring buffer max 200 items
        if (this.fileOperations.length >= 200) {
            this.fileOperations.shift();
        }
        this.fileOperations.push(op);

        const filename = (op.file || op.filename || 'unknown').toLowerCase();
        if (!this.fileStats.has(filename)) {
            this.fileStats.set(filename, {
                reads: 0,
                bytes: 0,
                hits: 0,
                misses: 0,
                waitMs: 0,
                latencies: []
            });
        }

        const stat = this.fileStats.get(filename);
        stat.reads++;
        if (op.hit) {
            stat.hits++;
            stat.bytes += op.bytes || op.length || 0;
        } else {
            stat.misses++;
        }
        const duration = typeof op.durationMs === 'number' ? op.durationMs : (typeof op.latencyMs === 'number' ? op.latencyMs : 0);
        stat.waitMs += duration;

        if (stat.latencies.length < 150) {
            stat.latencies.push(duration);
        } else {
            stat.latencies[Math.floor(Math.random() * 150)] = op.durationMs;
        }
    }

    recordFrameTime(frametimeMs) {
        if (!this.consent.isAllowed('performanceMetrics')) return;

        if (frametimeMs >= 1000) {
            this.engineMetrics.freezes.count1000ms++;
            this.logFreeze(frametimeMs, 'freeze_1000ms');
        } else if (frametimeMs >= 500) {
            this.engineMetrics.freezes.count500ms++;
            this.logFreeze(frametimeMs, 'freeze_500ms');
        } else if (frametimeMs >= 200) {
            this.engineMetrics.freezes.count200ms++;
            this.logFreeze(frametimeMs, 'freeze_200ms');
        } else if (frametimeMs >= 100) {
            this.engineMetrics.freezes.count100ms++;
        }
    }

    logFreeze(durationMs, level) {
        const event = {
            time: new Date().toISOString(),
            durationMs: +durationMs.toFixed(1),
            level,
            recentFiles: this.fileOperations.slice(-3).map(o => o.file)
        };
        this.engineMetrics.freezes.recentEvents.push(event);
        if (this.engineMetrics.freezes.recentEvents.length > 20) {
            this.engineMetrics.freezes.recentEvents.shift();
        }

        this.enqueueLog('warn', level, `Queda de frametime detectada: ${durationMs.toFixed(1)} ms`, event);
    }

    enqueueLog(level, category, message, meta = {}) {
        const entry = {
            id: Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            time: new Date().toISOString(),
            level,
            category,
            message: typeof message === 'string' ? message : JSON.stringify(message),
            meta
        };

        this.telemetryQueue.push(entry);

        // Immediate flush on critical errors
        if (level === 'error' || level === 'fatal') {
            this.flush();
        }
    }

    buildPayload() {
        const hasWindow = typeof window !== 'undefined';
        const hardwareProfile = this.consent.isAllowed('hardwareProfile') && hasWindow && window.CaptalvoHardwareProfiler
            ? window.CaptalvoHardwareProfiler.getExportableProfile()
            : { userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js/Captalvo' };

        const cacheStats = hasWindow && window.CaptalvoAdaptiveCache
            ? window.CaptalvoAdaptiveCache.getStats()
            : null;

        const bridgeStats = hasWindow && window.CaptalvoAssetBridge
            ? window.CaptalvoAssetBridge.getStats()
            : null;

        return {
            session_id: this.sessionId,
            timestamp: new Date().toISOString(),
            consent: this.consent.consent,
            environment: hardwareProfile,
            cache: cacheStats,
            bridge: bridgeStats,
            engine: this.engineMetrics,
            fileStats: this.getFileRanking(),
            events: this.telemetryQueue.splice(0, 50)
        };
    }

    async flush() {
        if (this.isFlushing || this.telemetryQueue.length === 0) return;
        this.isFlushing = true;

        const payload = this.buildPayload();
        const jsonStr = JSON.stringify(payload);

        try {
            const res = await fetch('/api/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: jsonStr,
                keepalive: true
            });

            if (res.ok) {
                this.retryCount = 0;
            } else {
                this.handleFlushError(payload.events);
            }
        } catch (err) {
            this.handleFlushError(payload.events);
        } finally {
            this.isFlushing = false;
        }
    }

    handleFlushError(failedEvents) {
        this.retryCount++;
        // Re-enqueue events with cap to prevent infinite memory growth
        if (this.telemetryQueue.length < 200) {
            this.telemetryQueue.unshift(...failedEvents);
        }
        const backoffMs = Math.min(60000, 1000 * Math.pow(2, this.retryCount));
        console.warn(`[CaptalvoDiagnostics] Falha ao enviar telemetria. Tentando novamente em ${(backoffMs / 1000).toFixed(0)}s`);
    }

    flushBeacon() {
        if (this.telemetryQueue.length === 0) return;
        const payload = this.buildPayload();
        try {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/telemetry', blob);
            }
        } catch (e) {}
    }

    getFileRanking() {
        const rows = [];
        for (const [name, stats] of this.fileStats.entries()) {
            const lats = stats.latencies.filter(n => typeof n === 'number').sort((a, b) => a - b);
            const idx50 = lats.length > 0 ? Math.min(Math.floor(lats.length * 0.5), lats.length - 1) : 0;
            const idx95 = lats.length > 0 ? Math.min(Math.floor(lats.length * 0.95), lats.length - 1) : 0;
            const idx99 = lats.length > 0 ? Math.min(Math.floor(lats.length * 0.99), lats.length - 1) : 0;

            const p50 = lats.length > 0 && typeof lats[idx50] === 'number' ? lats[idx50].toFixed(2) : '0.00';
            const p95 = lats.length > 0 && typeof lats[idx95] === 'number' ? lats[idx95].toFixed(2) : '0.00';
            const p99 = lats.length > 0 && typeof lats[idx99] === 'number' ? lats[idx99].toFixed(2) : '0.00';

            const hitPct = stats.reads > 0 ? +((stats.hits / stats.reads) * 100).toFixed(1) : 0;
            rows.push({
                file: name,
                name: name,
                reads: stats.reads,
                bytesMB: +(stats.bytes / (1024 * 1024)).toFixed(2),
                hitPercent: hitPct,
                hitRate: hitPct,
                latencyP50: parseFloat(p50),
                latencyP95: parseFloat(p95),
                latencyP99: parseFloat(p99),
                totalWaitMs: +stats.waitMs.toFixed(1)
            });
        }
        rows.sort((a, b) => b.reads - a.reads);
        return rows;
    }
}

// Global Singleton & Module Exports
if (typeof window !== 'undefined') {
    window.CaptalvoConsentManager = CaptalvoConsentManager;
    window.CaptalvoDiagnostics = new CaptalvoDiagnosticsSystem();
}
if (typeof module !== 'undefined') {
    module.exports = {
        CaptalvoConsentManager,
        CaptalvoDiagnosticsSystem
    };
}
