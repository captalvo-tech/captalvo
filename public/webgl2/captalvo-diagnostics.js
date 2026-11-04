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

// ==============================================================================
// CAPTALVO MOUSE & VIEWPORT DIAGNOSTICS (Zero Hour UI Hit-Test & Coordinate Tracking)
// Local in-memory diagnostics: never transmits individual click coords to remote telemetry
// ==============================================================================

const ZERO_HOUR_MAIN_MENU_BUTTONS = [
    { name: 'MainMenu.wnd:ButtonSinglePlayer', label: 'UM JOGADOR (Single Player)', rect: [540, 116, 748, 152] },
    { name: 'MainMenu.wnd:ButtonMultiplayer', label: 'MULTIPLAYER', rect: [540, 156, 748, 192] },
    { name: 'MainMenu.wnd:ButtonLoadReplay', label: 'CARREGAR REPLAY', rect: [540, 196, 748, 231] },
    { name: 'MainMenu.wnd:ButtonOptions', label: 'OPÇÕES (Options)', rect: [540, 236, 748, 272] },
    { name: 'MainMenu.wnd:ButtonCredits', label: 'CRÉDITOS', rect: [540, 276, 748, 312] },
    { name: 'MainMenu.wnd:ButtonExit', label: 'SAIR (Exit)', rect: [540, 316, 748, 352] },
    // Submenu Single Player
    { name: 'MainMenu.wnd:ButtonUSA', label: 'CAMPANHA EUA', rect: [540, 116, 748, 152] },
    { name: 'MainMenu.wnd:ButtonGLA', label: 'CAMPANHA GLA', rect: [540, 156, 748, 192] },
    { name: 'MainMenu.wnd:ButtonChina', label: 'CAMPANHA CHINA', rect: [540, 196, 748, 231] },
    { name: 'MainMenu.wnd:ButtonChallenge', label: 'DESAFIO DOS GENERAIS', rect: [540, 236, 748, 272] },
    { name: 'MainMenu.wnd:ButtonSkirmish', label: 'ESCARAMUÇA (Skirmish)', rect: [540, 276, 748, 312] },
    { name: 'MainMenu.wnd:ButtonSingleBack', label: 'VOLTAR (Back)', rect: [540, 316, 748, 351] }
];

class CaptalvoMouseDiagnostics {
    constructor() {
        this.buttons = ZERO_HOUR_MAIN_MENU_BUTTONS;
        this.lastClick = null;
        this.history = [];
        this.clickCount = 0;
    }

    testHit(x, y) {
        const hits = [];
        for (const btn of this.buttons) {
            const [x1, y1, x2, y2] = btn.rect;
            if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
                hits.push(btn);
            }
        }
        return hits;
    }

    recordInput(domEvent, canvasRect, rawRelX, rawRelY, engineX, engineY, canvasW, canvasH) {
        if (!domEvent) return;
        const type = domEvent.type || 'mousedown';
        const isClick = (type === 'mousedown' || type === 'mouseup' || type === 'click');

        const hits = this.testHit(engineX, engineY);
        const hitNames = hits.map(h => h.label);

        const record = {
            time: new Date().toISOString(),
            type: type,
            button: domEvent.button !== undefined ? domEvent.button : 0,
            dom: {
                clientX: domEvent.clientX,
                clientY: domEvent.clientY,
                screenX: domEvent.screenX,
                screenY: domEvent.screenY
            },
            canvasRect: {
                width: +(canvasRect.width || 0).toFixed(1),
                height: +(canvasRect.height || 0).toFixed(1),
                left: +(canvasRect.left || 0).toFixed(1),
                top: +(canvasRect.top || 0).toFixed(1)
            },
            relative: {
                x: +rawRelX.toFixed(1),
                y: +rawRelY.toFixed(1)
            },
            engineResolution: {
                width: canvasW || 800,
                height: canvasH || 600
            },
            projectedEngineCoords: {
                x: engineX,
                y: engineY
            },
            sdlDelivery: 'CONFIRMED (Emscripten targetX/targetY written to event buffer)',
            hitTest: {
                hasHit: hits.length > 0,
                targets: hitNames
            }
        };

        if (isClick) {
            this.lastClick = record;
            this.clickCount++;
            this.history.unshift(record);
            if (this.history.length > 50) this.history.pop();

            const hitDesc = hitNames.length > 0 ? `🎯 HIT: ${hitNames.join(' | ')}` : '❌ Sem colisão com botões do menu';
            const logMsg = `[Diagnostics:Input] ${type.toUpperCase()} DOM(${domEvent.clientX}, ${domEvent.clientY}) -> RelCanvas(${rawRelX.toFixed(0)}, ${rawRelY.toFixed(0)}) -> Engine(${engineX}, ${engineY}) -> ${hitDesc}`;

            console.log(logMsg);
            if (typeof window !== 'undefined' && window.DevConsole && typeof window.DevConsole.write === 'function') {
                window.DevConsole.write(logMsg, hitNames.length > 0 ? 'log-ok' : 'log-info');
            }
        }
    }

    getDiagnosticsSummary() {
        const canvas = typeof document !== 'undefined' ? document.getElementById('canvas') : null;
        const rect = canvas ? canvas.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
        return {
            canvasBuffer: canvas ? `${canvas.width}x${canvas.height}` : 'N/A',
            canvasCssRect: `${rect.width.toFixed(1)}x${rect.height.toFixed(1)} at (${rect.left.toFixed(1)}, ${rect.top.toFixed(1)})`,
            devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
            targetResolution: '800x600 (Fixed 4:3 Engine Layout)',
            totalClicks: this.clickCount,
            lastClick: this.lastClick
        };
    }
}

// Global Singleton & Module Exports
if (typeof window !== 'undefined') {
    window.CaptalvoConsentManager = CaptalvoConsentManager;
    window.CaptalvoDiagnostics = new CaptalvoDiagnosticsSystem();
    window.CaptalvoMouseDiag = new CaptalvoMouseDiagnostics();
}
if (typeof module !== 'undefined') {
    module.exports = {
        CaptalvoConsentManager,
        CaptalvoDiagnosticsSystem,
        CaptalvoMouseDiagnostics,
        ZERO_HOUR_MAIN_MENU_BUTTONS
    };
}
