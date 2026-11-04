// ==============================================================================
// CAPTALVO — Client Application Core
// Conquista sem limites.
// ==============================================================================

'use strict';

const REQUIRED_ASSETS = [
    { name: 'INIZH.big', desc: 'Configuração Zero Hour', required: true },
    { name: 'TexturesZH.big', desc: 'Texturas Zero Hour', required: true },
    { name: 'W3DZH.big', desc: 'Modelos 3D Zero Hour', required: true },
    { name: 'WindowZH.big', desc: 'Interface e Telas ZH', required: true },
    { name: 'MapsZH.big', desc: 'Mapas Zero Hour', required: true },
    { name: 'TerrainZH.big', desc: 'Texturas de Terreno ZH', required: true },
    { name: 'ShadersZH.big', desc: 'Shaders Zero Hour', required: true },
    { name: 'PatchINI.big', desc: 'Patches de Inicialização', required: true },
    { name: 'INI.big', desc: 'Configuração Base', required: false },
    { name: 'Textures.big', desc: 'Texturas Base', required: false },
    { name: 'W3D.big', desc: 'Modelos 3D Base', required: false },
    { name: 'maps.big', desc: 'Mapas Base', required: false },
    { name: 'Window.big', desc: 'Interface Base', required: false },
    { name: 'Terrain.big', desc: 'Terreno Base', required: false },
    { name: 'shaders.big', desc: 'Shaders Base', required: false },
];

const LOCALIZATION_VARIANTS = [
    { target: 'EnglishZH.big', alternatives: ['BrazilianZH.big', 'brazilianzh.big', 'englishzh.big'] },
    { target: 'English.big', alternatives: ['Brazilian.big', 'brazilian.big', 'english.big'] },
    { target: 'SpeechEnglishZH.big', alternatives: ['SpeechBrazilianZH.big', 'speechbrazilianzh.big'] },
    { target: 'AudioEnglishZH.big', alternatives: ['AudioBrazilianZH.big', 'audiobrazilianzh.big'] }
];

const AppState = {
    opfsSupported: false,
    opfsRoot: null,
    assetsDir: null,
    installedFiles: new Set(),
    isGameReady: false,
    isGameRunning: false,
    backendHealthy: false,
};

// =============================================================================
// CAPTALVO HARDWARE & CLIENT ENVIRONMENT PROFILER
// =============================================================================
const CaptalvoHardwareProfiler = {
    profile: {
        disk: {
            type: 'Detectando velocidade...',
            category: 'unknown',
            speedMBps: null,
            writeMs: null,
            readMs: null,
            quotaGB: null,
            usedMB: null,
            opfs: false,
            persisted: false
        },
        cpu: {
            cores: navigator.hardwareConcurrency || 4,
            architecture: 'x86_64',
            bitness: '64',
            platform: navigator.platform || 'Unknown',
            loadPercent: 0,
            jitterMs: 0,
            benchScore: 0
        },
        gpu: {
            renderer: 'Detectando...',
            vendor: 'Desconhecido',
            api: 'WebGL 2.0',
            maxTextureSize: 0,
            maxRenderbufferSize: 0,
            shadingLanguage: 'GLSL ES 3.00',
            webgpu: false
        },
        ram: {
            systemRamGB: navigator.deviceMemory || 8,
            heapUsedMB: 0,
            heapTotalMB: 0,
            heapLimitMB: 0,
            heapPercent: 0
        },
        display: {
            screen: `${window.screen ? window.screen.width : 0}x${window.screen ? window.screen.height : 0}`,
            window: `${window.innerWidth}x${window.innerHeight}`,
            dpr: window.devicePixelRatio || 1,
            refreshRateHz: 60,
            colorDepth: window.screen ? window.screen.colorDepth : 24,
            hdr: false
        },
        network: {
            effectiveType: 'unknown',
            downlinkMbps: 0,
            rttMs: 0,
            saveData: false,
            downloadSpeedKBps: 0,
            uploadSpeedKBps: 0,
            totalDownloadedBytes: 0,
            totalUploadedBytes: 0
        },
        battery: {
            level: null,
            charging: null
        },
        os: {
            platform: navigator.platform || '',
            userAgent: navigator.userAgent || '',
            language: navigator.language || '',
            languages: navigator.languages ? Array.from(navigator.languages) : [],
            timezone: ''
        }
    },

    isBenchmarkingDisk: false,
    refreshRateDetected: false,

    async init() {
        this.inspectDisplay();
        this.inspectGPU();
        this.inspectCPU();
        this.inspectRAM();
        this.inspectNetwork();
        this.inspectOS();
        this.inspectBattery();
        this.measureRefreshRate();
        this.setupTrafficObserver();
        await this.inspectDisk();
    },

    inspectDisplay() {
        if (window.screen) {
            this.profile.display.screen = `${window.screen.width}x${window.screen.height}`;
            this.profile.display.colorDepth = window.screen.colorDepth || 24;
        }
        this.profile.display.window = `${window.innerWidth}x${window.innerHeight}`;
        this.profile.display.dpr = +(window.devicePixelRatio || 1).toFixed(2);
        try {
            this.profile.display.hdr = window.matchMedia('(dynamic-range: high)').matches;
        } catch (e) {
            this.profile.display.hdr = false;
        }
    },

    inspectGPU() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (gl) {
                this.profile.gpu.api = (canvas.getContext('webgl2') ? 'WebGL 2.0 (Shader ES 3.00)' : 'WebGL 1.0');
                const dbg = gl.getExtension('WEBGL_debug_renderer_info');
                if (dbg) {
                    this.profile.gpu.vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || 'Genérico';
                    this.profile.gpu.renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'GPU WebGL';
                }
                this.profile.gpu.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
                this.profile.gpu.maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096;
                this.profile.gpu.shadingLanguage = gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || 'GLSL ES 3.00';
            }
            this.profile.gpu.webgpu = !!navigator.gpu;
        } catch (e) {
            this.profile.gpu.renderer = 'Acelerador Bloqueado/Restrito';
        }
    },

    async inspectCPU() {
        this.profile.cpu.cores = navigator.hardwareConcurrency || 4;
        this.profile.cpu.platform = navigator.platform || 'Unknown';

        // UserAgentData high entropy values (Chromium 90+)
        if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
            try {
                const data = await navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion']);
                if (data.architecture) this.profile.cpu.architecture = data.architecture;
                if (data.bitness) this.profile.cpu.bitness = data.bitness;
            } catch (e) {}
        } else {
            const ua = navigator.userAgent;
            if (/x86_64|Win64|WOW64|x64/i.test(ua)) {
                this.profile.cpu.architecture = 'x86';
                this.profile.cpu.bitness = '64';
            } else if (/arm64|aarch64/i.test(ua)) {
                this.profile.cpu.architecture = 'ARM';
                this.profile.cpu.bitness = '64';
            }
        }

        // Quick micro-benchmark (Single-core performance score)
        try {
            const tStart = performance.now();
            let sum = 0;
            for (let i = 0; i < 40000; i++) {
                sum += Math.sqrt(i * 1.618) + (i % 7);
            }
            const dur = Math.max(0.1, performance.now() - tStart);
            this.profile.cpu.benchScore = Math.round(40000 / dur);
        } catch (e) {}
    },

    inspectRAM() {
        this.profile.ram.systemRamGB = navigator.deviceMemory || 8;
        if (window.performance && performance.memory) {
            const m = performance.memory;
            this.profile.ram.heapUsedMB = +(m.usedJSHeapSize / (1024 * 1024)).toFixed(1);
            this.profile.ram.heapTotalMB = +(m.totalJSHeapSize / (1024 * 1024)).toFixed(1);
            this.profile.ram.heapLimitMB = +(m.jsHeapSizeLimit / (1024 * 1024)).toFixed(0);
            this.profile.ram.heapPercent = Math.min(100, Math.round((m.usedJSHeapSize / m.totalJSHeapSize) * 100));
        }
    },

    inspectNetwork() {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conn) {
            this.profile.network.effectiveType = conn.effectiveType || '4g';
            this.profile.network.downlinkMbps = conn.downlink || 10;
            this.profile.network.rttMs = conn.rtt || 20;
            this.profile.network.saveData = !!conn.saveData;
        }
    },

    inspectOS() {
        this.profile.os.platform = navigator.platform || 'Unknown';
        this.profile.os.userAgent = navigator.userAgent || '';
        this.profile.os.language = navigator.language || 'pt-BR';
        this.profile.os.languages = navigator.languages ? Array.from(navigator.languages) : [];
        try {
            this.profile.os.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        } catch (e) {}
    },

    async inspectBattery() {
        if (navigator.getBattery) {
            try {
                const batt = await navigator.getBattery();
                this.profile.battery.level = Math.round(batt.level * 100);
                this.profile.battery.charging = batt.charging;
                batt.addEventListener('levelchange', () => {
                    this.profile.battery.level = Math.round(batt.level * 100);
                });
                batt.addEventListener('chargingchange', () => {
                    this.profile.battery.charging = batt.charging;
                });
            } catch (e) {}
        }
    },

    measureRefreshRate() {
        if (this.refreshRateDetected) return;
        let frames = 0;
        let lastTime = performance.now();
        const intervals = [];

        const sample = (now) => {
            const delta = now - lastTime;
            lastTime = now;
            if (frames > 4 && delta > 2 && delta < 50) {
                intervals.push(delta);
            }
            frames++;
            if (frames < 45) {
                requestAnimationFrame(sample);
            } else {
                this.refreshRateDetected = true;
                if (intervals.length > 10) {
                    intervals.sort((a, b) => a - b);
                    const median = intervals[Math.floor(intervals.length / 2)];
                    const rawHz = 1000 / median;
                    const standards = [60, 75, 90, 120, 144, 165, 240, 360];
                    let closest = 60;
                    let minDiff = 999;
                    for (const std of standards) {
                        const diff = Math.abs(rawHz - std);
                        if (diff < minDiff) {
                            minDiff = diff;
                            closest = std;
                        }
                    }
                    this.profile.display.refreshRateHz = (minDiff < 8) ? closest : Math.round(rawHz);
                }
            }
        };
        requestAnimationFrame(sample);
    },

    setupTrafficObserver() {
        let lastObservedBytes = 0;
        let lastObservedTime = performance.now();

        try {
            if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes && PerformanceObserver.supportedEntryTypes.includes('resource')) {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        const bytes = entry.transferSize || entry.encodedBodySize || 0;
                        this.profile.network.totalDownloadedBytes += bytes;
                    }
                });
                observer.observe({ type: 'resource', buffered: true });
            }
        } catch (e) {}

        setInterval(() => {
            const now = performance.now();
            const elapsed = Math.max(0.5, (now - lastObservedTime) / 1000);
            const deltaBytes = Math.max(0, this.profile.network.totalDownloadedBytes - lastObservedBytes);
            lastObservedBytes = this.profile.network.totalDownloadedBytes;
            lastObservedTime = now;

            this.profile.network.downloadSpeedKBps = +( (deltaBytes / elapsed) / 1024 ).toFixed(1);
        }, 1000);
    },

    async inspectDisk() {
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const est = await navigator.storage.estimate();
                if (est.quota) this.profile.disk.quotaGB = +(est.quota / (1024 * 1024 * 1024)).toFixed(1);
                if (typeof est.usage === 'number') this.profile.disk.usedMB = +(est.usage / (1024 * 1024)).toFixed(1);
            }
            if (navigator.storage && navigator.storage.persisted) {
                this.profile.disk.persisted = await navigator.storage.persisted();
            }

            if (navigator.storage && navigator.storage.getDirectory) {
                this.profile.disk.opfs = true;
                await this.benchmarkDiskOPFS();
            } else {
                this.profile.disk.opfs = false;
                this.profile.disk.type = 'Armazenamento Web Padrão (Sem OPFS)';
                this.profile.disk.category = 'standard';
            }
        } catch (e) {
            console.warn('[HardwareProfiler] Erro inspecionando disco:', e);
            this.profile.disk.type = 'Armazenamento Local';
        }
        return this.profile.disk;
    },

    async benchmarkDiskOPFS() {
        if (this.isBenchmarkingDisk) return;
        this.isBenchmarkingDisk = true;
        try {
            const root = await navigator.storage.getDirectory();
            const fileName = `__captalvo_bench_${Date.now()}.tmp`;
            const fileHandle = await root.getFileHandle(fileName, { create: true });

            // 2 MB test payload
            const sizeBytes = 2 * 1024 * 1024;
            const buffer = new Uint8Array(sizeBytes);
            for (let i = 0; i < 2048; i += 4) {
                buffer[i] = (i * 37) & 0xff;
                buffer[i + 1] = (i * 91) & 0xff;
                buffer[i + 2] = (i * 13) & 0xff;
                buffer[i + 3] = (i * 157) & 0xff;
            }

            // Write benchmark
            const t0 = performance.now();
            const writable = await fileHandle.createWritable();
            await writable.write(buffer);
            await writable.close();
            const writeDuration = Math.max(1, performance.now() - t0);

            // Read benchmark
            const t1 = performance.now();
            const file = await fileHandle.getFile();
            await file.arrayBuffer();
            const readDuration = Math.max(1, performance.now() - t1);

            // Cleanup temp file
            await root.removeEntry(fileName).catch(() => {});

            // Calculate Throughput (Total 4 MB)
            const totalBytes = sizeBytes * 2;
            const totalSec = (writeDuration + readDuration) / 1000;
            const speedMBps = +((totalBytes / totalSec) / (1024 * 1024)).toFixed(1);

            this.profile.disk.speedMBps = speedMBps;
            this.profile.disk.writeMs = +writeDuration.toFixed(1);
            this.profile.disk.readMs = +readDuration.toFixed(1);

            // Classify Disk Type
            if (speedMBps >= 350) {
                this.profile.disk.type = 'NVMe SSD (Ultra Rápido)';
                this.profile.disk.category = 'nvme';
            } else if (speedMBps >= 110) {
                this.profile.disk.type = 'SATA SSD (Rápido)';
                this.profile.disk.category = 'sata_ssd';
            } else {
                this.profile.disk.type = 'HDD Convencional (Mecânico)';
                this.profile.disk.category = 'hdd';
            }
        } catch (err) {
            console.warn('[HardwareProfiler] Benchmark OPFS falhou:', err);
            this.profile.disk.type = 'Armazenamento OPFS';
        } finally {
            this.isBenchmarkingDisk = false;
        }
    },

    getExportableProfile() {
        this.inspectRAM();
        this.inspectDisplay();
        return JSON.parse(JSON.stringify(this.profile));
    }
};

// =============================================================================
// TELEMETRY & AUTOMATED REMOTE LOG INGESTION
// =============================================================================
const TelemetryManager = {
    sessionId: '',
    queue: [],
    seq: 0,
    isFlushing: false,
    flushTimer: null,
    environment: null,

    init() {
        try {
            this.sessionId = sessionStorage.getItem('captalvo_session_id') || '';
            if (!this.sessionId) {
                this.sessionId = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
                sessionStorage.setItem('captalvo_session_id', this.sessionId);
            }
        } catch (e) {
            this.sessionId = 'sess_' + Date.now().toString(36);
        }

        this.environment = this.gatherEnvironment();
        this.log('info', 'session_start', 'Sessão do Captalvo iniciada', {
            url: window.location.href,
            referrer: document.referrer,
            buildTime: window.__CAPTALVO_BUILD_TIME__ || null
        });

        // Periodic auto-flush every 15 seconds
        this.flushTimer = setInterval(() => this.flush(), 15000);

        // Page visibility change & unload flush via Beacon
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.flushBeacon();
        });
        window.addEventListener('pagehide', () => this.flushBeacon());

        console.log(`[Telemetry] Sistema de telemetria ativo. ID da Sessão: ${this.sessionId}`);
    },

    gatherEnvironment() {
        if (CaptalvoHardwareProfiler && CaptalvoHardwareProfiler.profile) {
            return CaptalvoHardwareProfiler.getExportableProfile();
        }

        let glInfo = { renderer: 'Unknown', vendor: 'Unknown' };
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (gl) {
                const dbg = gl.getExtension('WEBGL_debug_renderer_info');
                if (dbg) {
                    glInfo.vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || 'Unknown';
                    glInfo.renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'Unknown';
                }
            }
        } catch (e) {}

        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform || 'Unknown',
            language: navigator.language || 'Unknown',
            screen: `${window.screen.width}x${window.screen.height}`,
            pixelRatio: window.devicePixelRatio || 1,
            deviceMemoryGB: navigator.deviceMemory || null,
            hardwareConcurrency: navigator.hardwareConcurrency || null,
            secureContext: window.isSecureContext,
            sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
            crossOriginIsolated: !!window.crossOriginIsolated,
            opfsSupported: !!(navigator.storage && navigator.storage.getDirectory),
            gpu: glInfo
        };
    },

    log(level, category, message, meta = {}) {
        const entry = {
            id: ++this.seq,
            time: new Date().toISOString(),
            level,
            category,
            message: typeof message === 'string' ? message : JSON.stringify(message),
            meta
        };

        this.queue.push(entry);

        // Instant flush on critical errors or when queue reaches 15
        if (level === 'error' || level === 'fatal' || this.queue.length >= 15) {
            this.flush();
        }
    },

    async flush() {
        if (this.isFlushing || this.queue.length === 0) return;
        this.isFlushing = true;

        const currentEnv = (CaptalvoHardwareProfiler && CaptalvoHardwareProfiler.profile)
            ? CaptalvoHardwareProfiler.getExportableProfile()
            : this.environment;

        const batch = this.queue.splice(0, 40);
        const payload = {
            session_id: this.sessionId,
            timestamp: new Date().toISOString(),
            environment: currentEnv,
            events: batch
        };

        const jsonStr = JSON.stringify(payload);
        if (CaptalvoHardwareProfiler && CaptalvoHardwareProfiler.profile.network) {
            CaptalvoHardwareProfiler.profile.network.totalUploadedBytes += jsonStr.length;
        }

        try {
            const res = await fetch('/api/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: jsonStr,
                keepalive: true
            });

            if (!res.ok) {
                this.queue.unshift(...batch);
            }
        } catch (err) {
            this.queue.unshift(...batch);
        } finally {
            this.isFlushing = false;
        }
    },

    flushBeacon() {
        if (this.queue.length === 0) return;
        const currentEnv = (CaptalvoHardwareProfiler && CaptalvoHardwareProfiler.profile)
            ? CaptalvoHardwareProfiler.getExportableProfile()
            : this.environment;

        const batch = this.queue.splice(0, 40);
        const payload = {
            session_id: this.sessionId,
            timestamp: new Date().toISOString(),
            environment: currentEnv,
            events: batch
        };

        try {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/telemetry', blob);
            }
        } catch (e) {
            this.queue.unshift(...batch);
        }
    }
};

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    await CaptalvoHardwareProfiler.init();
    TelemetryManager.init();
    AfterburnerManager.init();
    initServiceWorker();
    await checkStorageSupport();
    await checkBackendHealth();
    await refreshInstalledAssets();
    setupUIEventListeners();
    applyStoredSettings();
    initDevConsole();
});

// -----------------------------------------------------------------------------
// Service Worker Registration (Anti-Cache / Zero-Cache Mode)
// -----------------------------------------------------------------------------
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('captalvo-sw.js?t=' + Date.now(), { updateViaCache: 'none' })
            .then((reg) => {
                reg.update();
                console.log('[Captalvo] Service Worker ativo (Zero-Cache Mode):', reg.scope);
            })
            .catch((err) => {
                console.warn('[Captalvo] Service Worker falhou:', err);
            });
    }
}

// Global Hard-Refresh Cache Buster Helper
window.CaptalvoBustCacheAndReload = async function() {
    console.log('[Captalvo] Limpando todos os caches e forçando recarregamento...');
    if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
    }
    try {
        sessionStorage.clear();
        document.cookie.split(";").forEach(c => {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
    } catch (e) {}
    window.location.href = window.location.pathname + '?_nocache=' + Date.now();
};

// -----------------------------------------------------------------------------
// Storage & OPFS Detection
// -----------------------------------------------------------------------------
async function checkStorageSupport() {
    const badge = document.getElementById('storage-badge');
    if (window.isSecureContext && navigator.storage && navigator.storage.getDirectory) {
        try {
            AppState.opfsRoot = await navigator.storage.getDirectory();
            AppState.assetsDir = await AppState.opfsRoot.getDirectoryHandle('assets', { create: true });
            AppState.opfsSupported = true;
            badge.textContent = 'OPFS Ativo';
            badge.className = 'status-badge badge-ready';
            return;
        } catch (e) {
            console.warn('[Captalvo] Falha ao inicializar OPFS:', e);
        }
    }
    badge.textContent = 'Storage Local';
    badge.className = 'status-badge badge-info';
}

// -----------------------------------------------------------------------------
// Backend Health Check
// -----------------------------------------------------------------------------
async function checkBackendHealth() {
    const badge = document.getElementById('backend-badge');
    try {
        const resp = await fetch('/api/health');
        if (resp.ok) {
            const data = await resp.json();
            if (data.status === 'ok') {
                AppState.backendHealthy = true;
                badge.textContent = `Online (PHP ${data.php_version})`;
                badge.className = 'status-badge badge-ready';
                return;
            }
        }
    } catch (e) {
        console.warn('[Captalvo] API health falhou:', e);
    }
    badge.textContent = 'Indisponível';
    badge.className = 'status-badge badge-missing';
}

// -----------------------------------------------------------------------------
// Scan Installed Assets in OPFS
// -----------------------------------------------------------------------------
async function refreshInstalledAssets() {
    AppState.installedFiles.clear();

    if (AppState.assetsDir) {
        try {
            for await (const [name] of AppState.assetsDir.entries()) {
                AppState.installedFiles.add(name);
                AppState.installedFiles.add(name.toLowerCase());
            }
        } catch (e) {
            console.warn('[Captalvo] Erro listando OPFS:', e);
        }
    }

    // Check required files
    let requiredCount = 0;
    let foundCount = 0;

    for (const item of REQUIRED_ASSETS) {
        if (item.required) {
            requiredCount++;
            if (AppState.installedFiles.has(item.name) || AppState.installedFiles.has(item.name.toLowerCase())) {
                foundCount++;
            }
        }
    }

    // Check localization files
    for (const loc of LOCALIZATION_VARIANTS) {
        const hasVariant = loc.alternatives.some((alt) => AppState.installedFiles.has(alt) || AppState.installedFiles.has(alt.toLowerCase()));
        if (hasVariant) {
            AppState.installedFiles.add(loc.target);
        }
    }

    const assetBadge = document.getElementById('assets-badge');
    const playBtn = document.getElementById('btn-play');
    const dockPlayBtn = document.getElementById('btn-dock-play');

    if (foundCount >= requiredCount && requiredCount > 0) {
        AppState.isGameReady = true;
        assetBadge.textContent = `${AppState.installedFiles.size} arquivos prontos`;
        assetBadge.className = 'status-badge badge-ready';
        if (playBtn) {
            playBtn.disabled = false;
            playBtn.textContent = 'JOGAR CAPTALVO';
        }
        if (dockPlayBtn) {
            dockPlayBtn.disabled = false;
            dockPlayBtn.textContent = '▶ JOGAR';
        }
    } else {
        AppState.isGameReady = false;
        assetBadge.textContent = foundCount > 0 ? `${foundCount}/${requiredCount} essenciais` : 'Não importados';
        assetBadge.className = 'status-badge badge-missing';
        if (playBtn) {
            playBtn.disabled = false;
            playBtn.textContent = 'IMPORTAR & JOGAR';
        }
        if (dockPlayBtn) {
            dockPlayBtn.disabled = false;
            dockPlayBtn.textContent = '▶ IMPORTAR & JOGAR';
        }
    }

    updateAssetListUI();
}

function updateAssetListUI() {
    const list = document.getElementById('modal-asset-list');
    if (!list) return;

    list.innerHTML = '';
    for (const item of REQUIRED_ASSETS) {
        const found = AppState.installedFiles.has(item.name) || AppState.installedFiles.has(item.name.toLowerCase());
        const div = document.createElement('div');
        div.className = `asset-item ${found ? 'found' : 'missing'}`;
        div.innerHTML = `<span>${item.name} <small>(${item.desc})</small></span><span>${found ? '✓ PRONTO' : '✗ PENDENTE'}</span>`;
        list.appendChild(div);
    }
}

// -----------------------------------------------------------------------------
// Folder & File Import Handlers
// -----------------------------------------------------------------------------
async function handleDirectoryImport() {
    if (!window.showDirectoryPicker) {
        // Fallback for browsers without showDirectoryPicker
        document.getElementById('file-input-fallback').click();
        return;
    }

    try {
        const dirHandle = await window.showDirectoryPicker({
            id: 'captalvo-game-folder',
            mode: 'read'
        });

        const progressWrap = document.getElementById('import-progress-wrap');
        const progressBar = document.getElementById('import-progress-bar');
        const progressDetail = document.getElementById('import-progress-detail');

        progressWrap.style.display = 'block';
        progressBar.style.width = '0%';
        progressDetail.textContent = 'Varrendo diretório selecionado...';

        const foundBigFiles = [];
        await scanDirectoryForBigFiles(dirHandle, foundBigFiles);

        if (foundBigFiles.length === 0) {
            alert('Nenhum arquivo .big foi encontrado na pasta selecionada.\nCertifique-se de selecionar a pasta onde o Command & Conquer Generals Zero Hour está instalado.');
            progressWrap.style.display = 'none';
            return;
        }

        // Copy files into OPFS assets directory
        let copied = 0;
        for (const item of foundBigFiles) {
            progressDetail.textContent = `Importando ${item.name} (${(item.file.size / (1024 * 1024)).toFixed(1)} MB)...`;
            
            const targetHandle = await AppState.assetsDir.getFileHandle(item.name, { create: true });
            const writable = await targetHandle.createWritable();
            await item.file.stream().pipeTo(writable);

            // If Brazilian Portuguese edition, also provide English aliases for engine compatibility
            const lower = item.name.toLowerCase();
            if (lower === 'brazilianzh.big') {
                const enHandle = await AppState.assetsDir.getFileHandle('EnglishZH.big', { create: true });
                const enWritable = await enHandle.createWritable();
                await (await targetHandle.getFile()).stream().pipeTo(enWritable);
            } else if (lower === 'brazilian.big') {
                const enHandle = await AppState.assetsDir.getFileHandle('English.big', { create: true });
                const enWritable = await enHandle.createWritable();
                await (await targetHandle.getFile()).stream().pipeTo(enWritable);
            }

            copied++;
            const pct = Math.round((copied / foundBigFiles.length) * 100);
            progressBar.style.width = `${pct}%`;
        }

        progressDetail.textContent = `Concluído! ${copied} arquivos importados com sucesso para o OPFS.`;
        await refreshInstalledAssets();

        setTimeout(() => {
            progressWrap.style.display = 'none';
            closeModal('modal-import');
        }, 1200);

    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('[Captalvo] Erro importando diretório:', err);
            alert('Erro durante a importação: ' + err.message);
        }
        document.getElementById('import-progress-wrap').style.display = 'none';
    }
}

async function scanDirectoryForBigFiles(dirHandle, results) {
    for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === 'file' && name.toLowerCase().endsWith('.big')) {
            const file = await handle.getFile();
            results.push({ name, file });
        } else if (handle.kind === 'directory') {
            // Recurse into subdirectories (e.g., base Generals folder or Zero Hour folder)
            await scanDirectoryForBigFiles(handle, results);
        }
    }
}

async function handleFileInputFallback(files) {
    if (!files || files.length === 0) return;

    const progressWrap = document.getElementById('import-progress-wrap');
    const progressBar = document.getElementById('import-progress-bar');
    const progressDetail = document.getElementById('import-progress-detail');

    progressWrap.style.display = 'block';

    let copied = 0;
    const bigFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.big'));

    if (bigFiles.length === 0) {
        alert('Nenhum arquivo .big selecionado.');
        progressWrap.style.display = 'none';
        return;
    }

    for (const file of bigFiles) {
        progressDetail.textContent = `Importando ${file.name}...`;
        const targetHandle = await AppState.assetsDir.getFileHandle(file.name, { create: true });
        const writable = await targetHandle.createWritable();
        await file.stream().pipeTo(writable);

        copied++;
        progressBar.style.width = `${Math.round((copied / bigFiles.length) * 100)}%`;
    }

    progressDetail.textContent = `Concluído! ${copied} arquivos importados.`;
    await refreshInstalledAssets();

    setTimeout(() => {
        progressWrap.style.display = 'none';
        closeModal('modal-import');
    }, 1200);
}

// -----------------------------------------------------------------------------
// Engine Launch Coordinator
// -----------------------------------------------------------------------------
async function startGame() {
    if (!AppState.isGameReady) {
        openModal('modal-import');
        return;
    }

    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('main-progress-fill');
    const progressDetail = document.getElementById('main-progress-detail');
    const progressStatus = document.getElementById('main-progress-status');

    progressContainer.style.display = 'block';
    progressFill.style.width = '10%';
    progressStatus.textContent = 'INICIALIZANDO MOTOR WEBASSEMBLY';
    progressDetail.textContent = 'Carregando binários do Zero Hour...';

    // Configure Emscripten Module
    window.Module = {
        canvas: document.getElementById('canvas'),
        print: (text) => {
            console.log('[ZeroHour-WASM]', text);
            if (DevConsole) DevConsole.write(text);
            if (TelemetryManager) TelemetryManager.log('info', 'wasm_stdout', text);
        },
        printErr: (text) => {
            console.warn('[ZeroHour-WASM]', text);
            if (DevConsole) DevConsole.write(text, 'log-err');
            if (TelemetryManager) TelemetryManager.log('warn', 'wasm_stderr', text);
        },
        onRuntimeInitialized: () => {
            console.log('[Captalvo] Runtime WASM inicializado com sucesso.');
            if (TelemetryManager) TelemetryManager.log('info', 'lifecycle', 'Runtime WASM inicializado com sucesso');
            progressFill.style.width = '100%';
            progressStatus.textContent = 'PRONTO';
            progressDetail.textContent = 'Iniciando simulação...';

            setTimeout(() => {
                const shell = document.getElementById('captalvo-shell');
                if (shell) shell.classList.add('hidden');
                const homeMain = document.getElementById('home-main');
                if (homeMain) homeMain.style.display = 'none';
                const gameContainer = document.getElementById('game-container');
                if (gameContainer) gameContainer.style.display = 'flex';
                const escapeBar = document.getElementById('game-escape-bar');
                if (escapeBar) escapeBar.style.display = 'flex';
                AppState.isGameRunning = true;
            }, 600);
        },
        setStatus: (text) => {
            if (text) {
                progressDetail.textContent = text;
                const m = text.match(/\((\d+)\/(\d+)\)/);
                if (m) {
                    const pct = Math.round((parseInt(m[1]) / parseInt(m[2])) * 100);
                    progressFill.style.width = `${pct}%`;
                }
            }
        },
        onAbort: (err) => {
            console.error('[Captalvo] Abort:', err);
            if (TelemetryManager) TelemetryManager.log('fatal', 'wasm_abort', String(err));
            alert('O motor de jogo foi abortado: ' + err);
            progressContainer.style.display = 'none';
        }
    };

    // Global GeneralsX Progress callback if supported
    window.GeneralsX = window.GeneralsX || {};
    window.GeneralsX.setProgress = (stage, cur, tot, label) => {
        if (tot > 0) {
            const pct = Math.round((cur / tot) * 100);
            progressFill.style.width = `${pct}%`;
        }
        if (label) {
            progressDetail.textContent = label;
        }
        if (stage === 'ready') {
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
            const homeMain = document.getElementById('home-main');
            if (homeMain) homeMain.style.display = 'none';
            const gameContainer = document.getElementById('game-container');
            if (gameContainer) gameContainer.style.display = 'flex';
            const gameEscapeBar = document.getElementById('game-escape-bar');
            if (gameEscapeBar) gameEscapeBar.style.display = 'flex';
            if (window.CaptalvoHomeSim) window.CaptalvoHomeSim.pause();
            AppState.isGameRunning = true;
        }
    };

    // Load GeneralsZH.js dynamically with live anti-cache timestamp
    try {
        const script = document.createElement('script');
        script.src = 'GeneralsZH.js?t=' + Date.now();
        script.async = true;
        document.body.appendChild(script);
    } catch (e) {
        console.error('[Captalvo] Erro carregando script do motor:', e);
        alert('Falha ao carregar o script do motor: ' + e.message);
        progressContainer.style.display = 'none';
    }
}

// -----------------------------------------------------------------------------
// UI Event Handlers & Modals
// -----------------------------------------------------------------------------
function setupUIEventListeners() {
    // Launcher Open & Quick Dock Toggle
    const btnOpenLauncher = document.getElementById('btn-open-launcher');
    if (btnOpenLauncher) {
        btnOpenLauncher.addEventListener('click', () => {
            openModal('modal-launcher');
            const dock = document.getElementById('home-quick-dock');
            if (dock) dock.classList.remove('hidden');
        });
    }

    // Quick Dock buttons
    const btnDockPlay = document.getElementById('btn-dock-play');
    if (btnDockPlay) {
        btnDockPlay.addEventListener('click', startGame);
    }
    const btnDockImport = document.getElementById('btn-dock-import');
    if (btnDockImport) {
        btnDockImport.addEventListener('click', () => openModal('modal-import'));
    }
    const btnDockAfterburner = document.getElementById('btn-dock-afterburner');
    if (btnDockAfterburner) {
        btnDockAfterburner.addEventListener('click', () => AfterburnerManager.openModal());
    }
    const btnDockDiag = document.getElementById('btn-dock-diag');
    if (btnDockDiag) {
        btnDockDiag.addEventListener('click', async () => {
            openModal('modal-diag');
            await CaptalvoDiagnostics.renderDiagnosticsUI();
        });
    }
    const btnDockConsole = document.getElementById('btn-dock-console');
    if (btnDockConsole) {
        btnDockConsole.addEventListener('click', () => DevConsole.open());
    }
    const btnDockSettings = document.getElementById('btn-dock-settings');
    if (btnDockSettings) {
        btnDockSettings.addEventListener('click', () => openModal('modal-settings'));
    }

    document.getElementById('btn-play').addEventListener('click', startGame);
    document.getElementById('btn-import-assets').addEventListener('click', () => openModal('modal-import'));
    document.getElementById('btn-settings').addEventListener('click', () => openModal('modal-settings'));
    document.getElementById('btn-info').addEventListener('click', () => openModal('modal-info'));
    document.getElementById('btn-diag').addEventListener('click', async () => {
        openModal('modal-diag');
        await CaptalvoDiagnostics.renderDiagnosticsUI();
    });
    const btnAfterburner = document.getElementById('btn-afterburner');
    if (btnAfterburner) {
        btnAfterburner.addEventListener('click', () => AfterburnerManager.openModal());
    }
    document.getElementById('btn-toggle-console').addEventListener('click', () => {
        DevConsole.open();
    });
    const btnGameAfterburner = document.getElementById('btn-game-afterburner');
    if (btnGameAfterburner) {
        btnGameAfterburner.addEventListener('click', () => AfterburnerManager.toggleOSD());
    }
    document.getElementById('btn-game-console').addEventListener('click', () => {
        DevConsole.open();
    });
    document.getElementById('btn-run-diag').addEventListener('click', async () => {
        await CaptalvoDiagnostics.renderDiagnosticsUI();
    });
    const btnDiagCacheBust = document.getElementById('btn-diag-cache-bust');
    if (btnDiagCacheBust) {
        btnDiagCacheBust.addEventListener('click', () => {
            if (confirm('Deseja purgar todo o cache, service workers e cookies para carregar a versão mais recente?')) {
                window.CaptalvoBustCacheAndReload();
            }
        });
    }
    document.getElementById('btn-copy-diag-report').addEventListener('click', async () => {
        await CaptalvoDiagnostics.copyReportToClipboard();
    });

    document.getElementById('btn-pick-folder').addEventListener('click', handleDirectoryImport);
    document.getElementById('btn-pick-files').addEventListener('click', () => {
        document.getElementById('file-input-fallback').click();
    });

    document.getElementById('file-input-fallback').addEventListener('change', (e) => {
        handleFileInputFallback(e.target.files);
    });

    // Drag and Drop support on dropzone
    const dropZone = document.getElementById('import-drop-zone');
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files) {
            handleFileInputFallback(e.dataTransfer.files);
        }
    });

    // Modal Close buttons
    document.querySelectorAll('.modal-close, .btn-modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal-overlay');
            if (modal) modal.classList.remove('active');
        });
    });

    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });

    // Exit Game button
    document.getElementById('btn-exit-game').addEventListener('click', () => {
        const homeMain = document.getElementById('home-main');
        if (homeMain) homeMain.style.display = 'flex';
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.style.display = 'none';
        const gameEscapeBar = document.getElementById('game-escape-bar');
        if (gameEscapeBar) gameEscapeBar.style.display = 'none';
        if (window.CaptalvoHomeSim) window.CaptalvoHomeSim.resume();
        AppState.isGameRunning = false;
    });

    // Settings save
    document.getElementById('setting-fps').addEventListener('change', (e) => {
        localStorage.setItem('captalvo_fps', e.target.value);
    });
    document.getElementById('setting-lock-cursor').addEventListener('change', (e) => {
        localStorage.setItem('captalvo_lock_cursor', e.target.checked ? '1' : '0');
    });
    document.getElementById('setting-edge-scroll').addEventListener('change', (e) => {
        localStorage.setItem('captalvo_edge_scroll', e.target.checked ? '1' : '0');
    });

    // Cache purge & force reload
    const btnForceCacheBust = document.getElementById('btn-force-cache-bust');
    if (btnForceCacheBust) {
        btnForceCacheBust.addEventListener('click', () => {
            if (confirm('Deseja limpar todo o cache e recarregar a versão mais recente do Captalvo?')) {
                window.CaptalvoBustCacheAndReload();
            }
        });
    }

    // Wipe storage
    document.getElementById('btn-wipe-storage').addEventListener('click', async () => {
        if (confirm('Tem certeza de que deseja remover todos os arquivos do jogo armazenados no navegador?')) {
            if (AppState.assetsDir) {
                for await (const [name] of AppState.assetsDir.entries()) {
                    await AppState.assetsDir.removeEntry(name, { recursive: true });
                }
            }
            localStorage.clear();
            alert('Armazenamento limpo com sucesso.');
            location.reload();
        }
    });
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

function applyStoredSettings() {
    const fps = localStorage.getItem('captalvo_fps') || '60';
    document.getElementById('setting-fps').value = fps;

    const lockCursor = localStorage.getItem('captalvo_lock_cursor') === '1';
    document.getElementById('setting-lock-cursor').checked = lockCursor;

    const edgeScroll = localStorage.getItem('captalvo_edge_scroll') !== '0';
    document.getElementById('setting-edge-scroll').checked = edgeScroll;
}

// =============================================================================
// CAPTALVO DIAGNOSTICS & SYSTEM TELEMETRY
// =============================================================================
const CaptalvoDiagnostics = {
    async getGpuInfo() {
        const info = {
            api: 'WebGL 2.0',
            vendor: 'Desconhecido',
            renderer: 'Desconhecido',
            maxTextureSize: 0,
            status: 'ok'
        };

        try {
            const tempCanvas = document.createElement('canvas');
            const gl = tempCanvas.getContext('webgl2') || tempCanvas.getContext('webgl');
            if (gl) {
                const ext = gl.getExtension('WEBGL_debug_renderer_info');
                if (ext) {
                    info.vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || 'Genérico';
                    info.renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'Acelerador WebGL';
                }
                info.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
                info.api = gl.getParameter(gl.VERSION) || 'WebGL 2.0';
            } else {
                info.status = 'bad';
                info.renderer = 'Não suportado no navegador';
            }
        } catch (e) {
            info.status = 'warn';
            info.renderer = 'Restrito pelo navegador';
        }
        return info;
    },

    getAudioInfo() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
            return { state: 'Não suportado', sampleRate: 'N/A', status: 'bad' };
        }
        try {
            const ctx = new AudioCtx();
            const state = ctx.state;
            const rate = ctx.sampleRate + ' Hz';
            ctx.close().catch(() => {});
            return { state, sampleRate: rate, status: 'ok' };
        } catch (e) {
            return { state: 'Restrito', sampleRate: '44100 Hz', status: 'warn' };
        }
    },

    getMemoryInfo() {
        const res = { wasmHeap: 'Dinâmico', jsHeap: 'N/A' };
        if (window.Module && window.Module.HEAPU8) {
            res.wasmHeap = (window.Module.HEAPU8.byteLength / (1024 * 1024)).toFixed(0) + ' MB';
        }
        if (performance && performance.memory) {
            res.jsHeap = (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(0) + ' MB';
        }
        return res;
    },

    async getNetworkInfo() {
        const start = performance.now();
        try {
            const r = await fetch('/api/health?t=' + Date.now(), { cache: 'no-store' });
            const lat = Math.round(performance.now() - start);
            if (r.ok) {
                const data = await r.json();
                return { latency: lat + ' ms', php: 'PHP ' + (data.php_version || '8.3'), status: 'ok' };
            }
        } catch (e) {}
        return { latency: 'Erro de conexão', php: 'Indisponível', status: 'bad' };
    },

    async runFullDiagnostics() {
        const [gpu, net] = await Promise.all([
            this.getGpuInfo(),
            this.getNetworkInfo()
        ]);
        const audio = this.getAudioInfo();
        const mem = this.getMemoryInfo();

        return {
            timestamp: new Date().toISOString(),
            gpu,
            audio,
            mem,
            net,
            wasm: {
                supported: typeof WebAssembly !== 'undefined',
                sab: typeof SharedArrayBuffer !== 'undefined',
                coi: window.crossOriginIsolated || false
            },
            storage: {
                driver: AppState.opfsSupported ? 'OPFS' : 'IndexedDB',
                fileCount: AppState.installedFiles.size,
                swActive: navigator.serviceWorker && !!navigator.serviceWorker.controller
            }
        };
    },

    async renderDiagnosticsUI() {
        const diag = await this.runFullDiagnostics();

        // GPU
        document.getElementById('diag-gpu-api').textContent = diag.gpu.api;
        document.getElementById('diag-gpu-vendor').textContent = diag.gpu.vendor;
        document.getElementById('diag-gpu-renderer').textContent = diag.gpu.renderer;
        document.getElementById('diag-gpu-max-tex').textContent = diag.gpu.maxTextureSize + 'px';
        const gpuPill = document.getElementById('diag-gpu-pill');
        gpuPill.className = `diag-pill ${diag.gpu.status}`;
        gpuPill.textContent = diag.gpu.status === 'ok' ? 'ATIVO' : 'ATENÇÃO';

        // WASM
        document.getElementById('diag-wasm-status').textContent = diag.wasm.supported ? 'SIM (NATIVO)' : 'NÃO';
        document.getElementById('diag-sab-status').textContent = diag.wasm.sab ? 'DISPONÍVEL' : 'NÃO DISPONÍVEL';
        document.getElementById('diag-coi-status').textContent = diag.wasm.coi ? 'ATIVO (COOP/COEP)' : 'NÃO ISOLADO';
        document.getElementById('diag-wasm-heap').textContent = diag.mem.wasmHeap;

        // Audio
        document.getElementById('diag-audio-state').textContent = diag.audio.state;
        document.getElementById('diag-audio-rate').textContent = diag.audio.sampleRate;

        // Storage & VFS
        document.getElementById('diag-storage-driver').textContent = diag.storage.driver;
        document.getElementById('diag-sw-status').textContent = diag.storage.swActive ? 'ATIVO & INTERCEPTANDO' : 'REGISTRADO';
        document.getElementById('diag-big-count').textContent = diag.storage.fileCount + ' arquivos';

        // Network
        document.getElementById('diag-api-latency').textContent = diag.net.latency;
        document.getElementById('diag-php-version').textContent = diag.net.php;
        const netPill = document.getElementById('diag-backend-pill');
        netPill.className = `diag-pill ${diag.net.status}`;
        netPill.textContent = diag.net.status === 'ok' ? 'ONLINE' : 'FALHA';
    },

    async copyReportToClipboard() {
        const diag = await this.runFullDiagnostics();
        const text = `=== CAPTALVO ALPHA - RELATÓRIO DE TELEMETRIA ===
Data: ${diag.timestamp}
URL: https://captalvo.online

[GPU / RENDERIZADOR]
API: ${diag.gpu.api}
Fabricante: ${diag.gpu.vendor}
Placa: ${diag.gpu.renderer}
Textura Máx: ${diag.gpu.maxTextureSize}px

[WEBASSEMBLY & RUNTIME]
WASM Suporte: ${diag.wasm.supported}
SharedArrayBuffer: ${diag.wasm.sab}
Cross-Origin Isolated: ${diag.wasm.coi}
Heap WASM: ${diag.mem.wasmHeap}
Heap JS: ${diag.mem.jsHeap}

[ÁUDIO]
AudioContext: ${diag.audio.state}
Taxa: ${diag.audio.sampleRate}

[VFS & ARMAZENAMENTO]
Driver: ${diag.storage.driver}
Arquivos .BIG: ${diag.storage.fileCount}
Service Worker: ${diag.storage.swActive}

[BACKEND HOSTINGER]
Serviço: ${diag.net.php}
Latência API: ${diag.net.latency}
=================================================`;

        try {
            await navigator.clipboard.writeText(text);
            alert('Relatório de diagnóstico copiado para a área de transferência!');
        } catch (e) {
            console.log(text);
            alert('Relatório impresso no console do navegador.');
        }
    }
};

// =============================================================================
// AFTERBURNER HUD & PERFORMANCE MONITOR
// =============================================================================
const AfterburnerManager = {
    isOSDVisible: false,
    frameBuffer: [],
    maxBuffer: 90,
    lastFrameTime: performance.now(),
    frameCount: 0,
    lastFpsUpdate: performance.now(),
    fps: 0,
    minFps: 999,
    maxFps: 0,
    avgFps: 0,
    onePercentLowFps: 0,
    currentFrametime: 16.6,
    jitterMs: 0,
    cpuLoadPercent: 0,
    canvasCtx: null,
    sparklineCanvas: null,

    init() {
        this.sparklineCanvas = document.getElementById('af-ft-canvas');
        if (this.sparklineCanvas) {
            this.canvasCtx = this.sparklineCanvas.getContext('2d');
        }

        this.startLoop();
        this.startCpuTracker();
        this.initOsdDragging();

        // Bind Afterburner UI controls
        const btnToggleOsd = document.getElementById('btn-toggle-osd');
        if (btnToggleOsd) {
            btnToggleOsd.addEventListener('click', () => this.toggleOSD());
        }
        const btnOsdClose = document.getElementById('btn-osd-close');
        if (btnOsdClose) {
            btnOsdClose.addEventListener('click', () => this.hideOSD());
        }
        const btnAfBench = document.getElementById('btn-af-benchmark-disk');
        if (btnAfBench) {
            btnAfBench.addEventListener('click', () => this.runDiskBenchmark());
        }
        const btnAfSync = document.getElementById('btn-af-sync-telemetry');
        if (btnAfSync) {
            btnAfSync.addEventListener('click', async () => {
                const orig = btnAfSync.textContent;
                btnAfSync.textContent = '⏳ Sincronizando...';
                await TelemetryManager.flush();
                btnAfSync.textContent = '✅ Sincronizado!';
                setTimeout(() => { btnAfSync.textContent = orig; }, 2000);
            });
        }
    },

    openModal() {
        openModal('modal-afterburner');
        this.updateModal();
    },

    toggleOSD() {
        const osd = document.getElementById('afterburner-osd');
        if (!osd) return;
        this.isOSDVisible = !this.isOSDVisible;
        if (this.isOSDVisible) {
            osd.classList.remove('hidden');
        } else {
            osd.classList.add('hidden');
        }
    },

    hideOSD() {
        const osd = document.getElementById('afterburner-osd');
        if (osd) osd.classList.add('hidden');
        this.isOSDVisible = false;
    },

    async runDiskBenchmark() {
        const btn = document.getElementById('btn-af-benchmark-disk');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Executando Benchmark I/O...';
        }
        await CaptalvoHardwareProfiler.benchmarkDiskOPFS();
        if (btn) {
            btn.disabled = false;
            btn.textContent = '⚡ Rodar Benchmark Rápido de Disco (I/O)';
        }
        this.updateModal();
        if (DevConsole && DevConsole.isOpen) {
            DevConsole.write(`[Disk Benchmark] ${CaptalvoHardwareProfiler.profile.disk.type} - Velocidade: ${CaptalvoHardwareProfiler.profile.disk.speedMBps} MB/s`, 'log-ok');
        }
    },

    startLoop() {
        const tick = (now) => {
            const delta = now - this.lastFrameTime;
            this.lastFrameTime = now;

            if (delta > 0 && delta < 500) {
                this.currentFrametime = delta;
                this.frameBuffer.push(delta);
                if (this.frameBuffer.length > this.maxBuffer) {
                    this.frameBuffer.shift();
                }
            }

            this.frameCount++;
            if (now - this.lastFpsUpdate >= 500) {
                const elapsed = (now - this.lastFpsUpdate) / 1000;
                this.fps = Math.round(this.frameCount / elapsed);
                this.frameCount = 0;
                this.lastFpsUpdate = now;

                if (this.frameBuffer.length > 5) {
                    const sorted = [...this.frameBuffer].sort((a, b) => a - b);
                    const sum = this.frameBuffer.reduce((a, b) => a + b, 0);
                    const avgFt = sum / this.frameBuffer.length;
                    this.avgFps = Math.round(1000 / avgFt);
                    this.minFps = Math.round(1000 / sorted[sorted.length - 1]);
                    this.maxFps = Math.round(1000 / sorted[0]);

                    const p99Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99));
                    const p99Frametime = sorted[p99Index] || avgFt;
                    this.onePercentLowFps = Math.round(1000 / Math.max(1, p99Frametime));
                    this.jitterMs = +(sorted[sorted.length - 1] - sorted[0]).toFixed(1);
                }

                // Update escape bar FPS
                const escapeFps = document.getElementById('game-fps-counter');
                if (escapeFps) escapeFps.textContent = `${this.fps} FPS`;

                this.updateUI();
            }

            this.drawSparkline();
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    },

    startCpuTracker() {
        let lastTick = performance.now();
        setInterval(() => {
            const now = performance.now();
            const expected = 100;
            const delta = now - lastTick;
            lastTick = now;
            const lag = Math.max(0, delta - expected);
            this.cpuLoadPercent = Math.min(100, Math.round((lag / 16.6) * 100));
            CaptalvoHardwareProfiler.profile.cpu.loadPercent = this.cpuLoadPercent;
            CaptalvoHardwareProfiler.profile.cpu.jitterMs = +lag.toFixed(1);
        }, 100);
    },

    drawSparkline() {
        if (!this.canvasCtx || !this.sparklineCanvas || this.frameBuffer.length < 2) return;
        const ctx = this.canvasCtx;
        const w = this.sparklineCanvas.width;
        const h = this.sparklineCanvas.height;

        ctx.clearRect(0, 0, w, h);

        // Target baseline 16.6ms line (60 FPS)
        const baselineY = h - (16.6 / 45) * h;
        ctx.strokeStyle = 'rgba(98, 120, 107, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, baselineY);
        ctx.lineTo(w, baselineY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Plot Frametimes
        const step = w / (this.maxBuffer - 1);
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        for (let i = 0; i < this.frameBuffer.length; i++) {
            const ft = this.frameBuffer[i];
            const x = i * step;
            const norm = Math.min(1, ft / 45);
            const y = h - (norm * (h - 4)) - 2;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        if (this.currentFrametime <= 18) {
            ctx.strokeStyle = '#2ecc71';
        } else if (this.currentFrametime <= 34) {
            ctx.strokeStyle = '#f1c40f';
        } else {
            ctx.strokeStyle = '#e74c3c';
        }
        ctx.stroke();
    },

    updateUI() {
        if (document.getElementById('modal-afterburner') && document.getElementById('modal-afterburner').classList.contains('active')) {
            this.updateModal();
        }
        if (this.isOSDVisible) {
            this.updateOSD();
        }
    },

    updateModal() {
        const prof = CaptalvoHardwareProfiler.profile;
        CaptalvoHardwareProfiler.inspectRAM();

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setTxt('af-fps-val', this.fps || '--');
        setTxt('af-fps-min', this.minFps === 999 ? '--' : this.minFps);
        setTxt('af-fps-avg', this.avgFps || '--');
        setTxt('af-fps-1low', this.onePercentLowFps || '--');

        setTxt('af-ft-val', this.currentFrametime ? this.currentFrametime.toFixed(1) : '--');
        setTxt('af-ft-jitter', this.jitterMs ? `${this.jitterMs} ms` : '0.0 ms');
        setTxt('af-refresh-rate', prof.display.refreshRateHz ? `${prof.display.refreshRateHz} Hz` : '-- Hz');

        setTxt('af-cpu-load', this.cpuLoadPercent);
        const cpuBar = document.getElementById('af-cpu-bar');
        if (cpuBar) cpuBar.style.width = `${this.cpuLoadPercent}%`;
        setTxt('af-cpu-cores', `${prof.cpu.cores} Cores Lógicos`);
        setTxt('af-cpu-arch', `${prof.cpu.architecture} (${prof.cpu.bitness}-bit)`);

        setTxt('af-ram-used', prof.ram.heapUsedMB || '--');
        const ramBar = document.getElementById('af-ram-bar');
        if (ramBar) ramBar.style.width = `${prof.ram.heapPercent || 0}%`;
        setTxt('af-ram-total', `${prof.ram.heapTotalMB || '--'} MB`);
        setTxt('af-ram-system', `${prof.ram.systemRamGB || '--'} GB`);

        // Disk
        const diskBadge = document.getElementById('af-disk-badge');
        if (diskBadge) {
            if (prof.disk.category === 'nvme') {
                diskBadge.className = 'status-badge badge-success';
                diskBadge.textContent = 'NVMe SSD';
            } else if (prof.disk.category === 'sata_ssd') {
                diskBadge.className = 'status-badge badge-info';
                diskBadge.textContent = 'SATA SSD';
            } else if (prof.disk.category === 'hdd') {
                diskBadge.className = 'status-badge badge-missing';
                diskBadge.textContent = 'HDD (Alerta)';
            } else {
                diskBadge.className = 'status-badge badge-info';
                diskBadge.textContent = 'OPFS';
            }
        }
        setTxt('af-disk-type', prof.disk.type);
        setTxt('af-disk-speed', prof.disk.speedMBps ? `${prof.disk.speedMBps} MB/s` : '-- MB/s');
        setTxt('af-disk-usage', `${prof.disk.usedMB || 0} MB / ${prof.disk.quotaGB || 0} GB Quota`);
        setTxt('af-disk-persisted', prof.disk.persisted ? 'Autorizado (Permanente)' : 'Padrão do Navegador');

        // GPU
        setTxt('af-gpu-renderer', prof.gpu.renderer);
        setTxt('af-gpu-vendor', prof.gpu.vendor);
        setTxt('af-gpu-api', prof.gpu.api);
        setTxt('af-gpu-max-tex', `${prof.gpu.maxTextureSize} x ${prof.gpu.maxTextureSize} px`);

        // Network
        setTxt('af-net-down-rate', `${prof.network.downloadSpeedKBps} KB/s`);
        setTxt('af-net-up-rate', `${prof.network.uploadSpeedKBps} KB/s`);
        const downMB = (prof.network.totalDownloadedBytes / (1024 * 1024)).toFixed(1);
        const upKB = (prof.network.totalUploadedBytes / 1024).toFixed(0);
        setTxt('af-net-total', `Down: ${downMB} MB • Up: ${upKB} KB`);
        setTxt('af-net-type', `${prof.network.effectiveType.toUpperCase()} (RTT: ${prof.network.rttMs} ms)`);

        // Display & Power
        setTxt('af-disp-screen', `${prof.display.screen} @ ${prof.display.refreshRateHz}Hz`);
        setTxt('af-disp-window', `${window.innerWidth}x${window.innerHeight} (DPR: ${prof.display.dpr}x)`);
        setTxt('af-disp-colors', `${prof.display.colorDepth} bits ${prof.display.hdr ? '(HDR Ativo)' : '(SDR)'}`);
        if (prof.battery.charging !== null) {
            setTxt('af-power-status', prof.battery.charging ? `⚡ Carregando (${prof.battery.level}%)` : `🔋 Bateria (${prof.battery.level}%)`);
        } else {
            setTxt('af-power-status', '🔌 Alimentação AC / Desktop');
        }

        setTxt('af-session-id', TelemetryManager.sessionId);
    },

    updateOSD() {
        const prof = CaptalvoHardwareProfiler.profile;
        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setTxt('osd-fps', this.fps);
        setTxt('osd-frametime', `(${this.currentFrametime.toFixed(1)} ms)`);
        setTxt('osd-cpu', `${this.cpuLoadPercent} %`);
        setTxt('osd-cpu-cores', `(${prof.cpu.cores}c)`);
        setTxt('osd-ram', `${prof.ram.heapUsedMB || 0} MB`);
        setTxt('osd-ram-max', `/ ${prof.ram.systemRamGB} GB`);
        
        const shortGpu = (prof.gpu.renderer || 'GPU').split('(')[0].replace('ANGLE', '').trim();
        setTxt('osd-gpu', shortGpu || 'GPU WebGL');

        const diskLabel = prof.disk.category === 'nvme' ? 'NVMe' : (prof.disk.category === 'sata_ssd' ? 'SSD' : 'HDD');
        setTxt('osd-disk', `${diskLabel} ${prof.disk.speedMBps ? prof.disk.speedMBps + ' MB/s' : ''}`);

        setTxt('osd-net', `↓ ${prof.network.downloadSpeedKBps} KB/s • ↑ ${prof.network.uploadSpeedKBps} KB/s`);
    },

    initOsdDragging() {
        const osd = document.getElementById('afterburner-osd');
        const handle = osd ? osd.querySelector('.osd-drag-handle') : null;
        if (!osd || !handle) return;

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let origLeft = 0;
        let origTop = 0;

        handle.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = osd.getBoundingClientRect();
            origLeft = rect.left;
            origTop = rect.top;
            osd.style.right = 'auto';
            osd.style.left = `${origLeft}px`;
            osd.style.top = `${origTop}px`;
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            osd.style.left = `${Math.max(10, Math.min(window.innerWidth - 220, origLeft + dx))}px`;
            osd.style.top = `${Math.max(10, Math.min(window.innerHeight - 150, origTop + dy))}px`;
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
};

// =============================================================================
// DEVELOPER CONSOLE (Modal Terminal & Diagnostic Logs)
// =============================================================================
const DevConsole = {
    panel: null,
    output: null,
    form: null,
    input: null,
    history: [],
    historyIndex: 0,
    isOpen: false,

    commands: [
        'help', 'afterburner', 'osd', 'hw', 'bench', 'copy', 'sendlogs', 'status', 'diag', 'gpu',
        'vfs', 'audio', 'mem', 'fps', 'ping', 'capture', 'cursor', 'clear', 'reload', 'close'
    ],

    init() {
        this.panel = document.getElementById('modal-console');
        this.output = document.getElementById('dev-console-output');
        this.form = document.getElementById('dev-console-form');
        this.input = document.getElementById('dev-console-input');

        if (!this.panel) return;

        // Sync / Send logs to server button in header
        const btnSync = document.getElementById('btn-console-sync');
        if (btnSync) {
            btnSync.addEventListener('click', async () => {
                const orig = btnSync.textContent;
                btnSync.textContent = '⏳ Enviando...';
                await TelemetryManager.flush();
                this.write(`[Telemetry] Logs sincronizados com o servidor. ID da Sessão: ${TelemetryManager.sessionId}`, 'log-ok');
                btnSync.textContent = '✅ Enviado!';
                setTimeout(() => { btnSync.textContent = orig; }, 2000);
            });
        }

        // Copy button in header
        const btnCopy = document.getElementById('btn-console-copy');
        if (btnCopy) {
            btnCopy.addEventListener('click', () => this.copyToClipboard());
        }

        // Clear button in header
        const btnClear = document.getElementById('btn-console-clear');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                this.output.innerHTML = '';
                this.write('Console limpo.', 'log-ok');
            });
        }

        // Command submission
        this.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const cmd = this.input.value.trim();
            this.input.value = '';
            if (!cmd) return;

            this.history.push(cmd);
            this.historyIndex = this.history.length;
            this.write(`> ${cmd}`, 'log-cmd');

            await this.execute(cmd);
        });

        // History and autocomplete
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' && this.historyIndex > 0) {
                this.historyIndex--;
                this.input.value = this.history[this.historyIndex] || '';
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                this.historyIndex = Math.min(this.historyIndex + 1, this.history.length);
                this.input.value = this.history[this.historyIndex] || '';
                e.preventDefault();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                const term = this.input.value.trim().toLowerCase();
                const matches = this.commands.filter(c => c.startsWith(term));
                if (matches.length === 1) {
                    this.input.value = matches[0] + ' ';
                } else if (matches.length > 1) {
                    this.write(`Comandos: ${matches.join('  ')}`, 'log-ok');
                }
            }
        });

        // Escape closes console modal when open
        window.addEventListener('keydown', (e) => {
            if (this.isOpen && e.key === 'Escape') {
                e.preventDefault();
                this.close();
            }
        });

        this.write('Captalvo Diagnostic Console initialized. Digite "help" para ver os comandos.', 'log-ok');
    },

    write(msg, className = '') {
        const span = document.createElement('div');
        if (className) span.className = className;
        span.textContent = msg;
        this.output.appendChild(span);
        this.output.scrollTop = this.output.scrollHeight;
    },

    copyToClipboard() {
        const text = this.output.innerText || this.output.textContent || '';
        if (!text.trim()) {
            this.write('Nenhum log disponível para copiar.', 'log-warn');
            return;
        }

        const notifySuccess = () => {
            this.write('✅ Todos os logs foram copiados com sucesso para a sua área de transferência!', 'log-ok');
            const btn = document.getElementById('btn-console-copy');
            if (btn) {
                const orig = btn.textContent;
                btn.textContent = '✅ Copiado!';
                btn.style.color = '#2ecc71';
                setTimeout(() => {
                    btn.textContent = orig;
                    btn.style.color = '';
                }, 2000);
            }
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(notifySuccess).catch(() => {
                this.fallbackCopy(text, notifySuccess);
            });
        } else {
            this.fallbackCopy(text, notifySuccess);
        }
    },

    fallbackCopy(text, successCb) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.top = '0';
            ta.style.left = '0';
            ta.style.width = '2em';
            ta.style.height = '2em';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const success = document.execCommand('copy');
            document.body.removeChild(ta);
            if (success) {
                if (successCb) successCb();
                else this.write('✅ Logs copiados com sucesso!', 'log-ok');
            } else {
                this.write('⚠️ Não foi possível copiar automaticamente. Selecione o texto do console e use Ctrl+C.', 'log-warn');
            }
        } catch (err) {
            this.write('⚠️ Selecione o texto no console e pressione Ctrl+C para copiar.', 'log-warn');
        }
    },

    open() {
        if (this.panel) this.panel.classList.add('active');
        this.isOpen = true;
        if (document.exitPointerLock) document.exitPointerLock();
        setTimeout(() => { if (this.input) this.input.focus(); }, 60);
    },

    close() {
        if (this.panel) this.panel.classList.remove('active');
        this.isOpen = false;
        if (this.input) this.input.blur();
    },

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    },

    async execute(cmdLine) {
        const parts = cmdLine.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (cmd) {
            case 'help':
                this.write(`Comandos disponíveis:
  afterburner  - Abre o painel Afterburner de hardware e monitor de FPS
  osd          - Alterna o HUD flutuante Afterburner na tela
  hw           - Exibe o perfil completo de hardware (CPU, GPU, RAM, Disco, Tela)
  bench        - Executa o benchmark de velocidade I/O do disco OPFS
  copy         - Copia todo o histórico de logs do console para a área de transferência
  sendlogs     - Envia/sincroniza todos os logs do console e telemetria para o servidor
  status       - Exibe resumo em tempo real do motor, áudio, memória e canvas
  diag         - Executa diagnóstico completo de hardware, WebAssembly e rede
  gpu          - Exibe detalhes do adaptador WebGL 2.0 e placa de vídeo
  vfs          - Lista todos os arquivos .BIG registrados no OPFS
  audio        - Exibe telemetria do subsistema de som
  mem          - Informações de uso de memória WASM e heap JS
  fps [num]    - Consulta ou ajusta o limitador de taxa de quadros (30/60/120)
  ping         - Testa latência direta da API PHP 8.3 (/api/health)
  capture      - Captura screenshot diagnóstica do canvas
  cursor free  - Força liberação do confinamento do ponteiro
  clear        - Limpa o histórico de mensagens do console
  reload       - Recarrega a aplicação
  close        - Fecha este painel modal (ou pressione Esc)`);
                break;

            case 'afterburner':
            case 'af':
                AfterburnerManager.openModal();
                this.write('Painel Afterburner aberto.', 'log-ok');
                break;

            case 'osd':
                AfterburnerManager.toggleOSD();
                this.write(`Afterburner OSD ${AfterburnerManager.isOSDVisible ? 'visível na tela' : 'oculto'}.`, 'log-ok');
                break;

            case 'hw':
            case 'hardware':
                const prof = CaptalvoHardwareProfiler.profile;
                this.write(`PERFIL DE HARDWARE & SISTEMA:
  DISCO: ${prof.disk.type} (Velocidade: ${prof.disk.speedMBps || '--'} MB/s, Uso: ${prof.disk.usedMB || 0} MB / ${prof.disk.quotaGB || 0} GB)
  CPU: ${prof.cpu.cores} Cores | Arch: ${prof.cpu.architecture} (${prof.cpu.bitness}-bit) | Bench: ${prof.cpu.benchScore} | Lag: ${prof.cpu.loadPercent}%
  GPU: ${prof.gpu.renderer} (${prof.gpu.vendor}) | MaxTex: ${prof.gpu.maxTextureSize}px
  RAM: Heap ${prof.ram.heapUsedMB} MB / ${prof.ram.heapTotalMB} MB | RAM Sistema: ${prof.ram.systemRamGB} GB
  TELA: ${prof.display.screen} @ ${prof.display.refreshRateHz}Hz (Janela: ${prof.display.window}, DPR: ${prof.display.dpr}x)
  REDE: ${prof.network.effectiveType.toUpperCase()} (${prof.network.downlinkMbps} Mbps, RTT: ${prof.network.rttMs} ms) | Down: ${prof.network.downloadSpeedKBps} KB/s
  BATERIA: ${prof.battery.charging !== null ? (prof.battery.charging ? 'Carregando ' : 'Bateria ') + prof.battery.level + '%' : 'Alimentação AC'}
  SISTEMA: ${prof.os.platform} | Timezone: ${prof.os.timezone} | Idioma: ${prof.os.language}`, 'log-ok');
                break;

            case 'bench':
                this.write('Executando benchmark de velocidade I/O de disco (OPFS)...', 'log-warn');
                await CaptalvoHardwareProfiler.benchmarkDiskOPFS();
                this.write(`Benchmark concluído: ${CaptalvoHardwareProfiler.profile.disk.type} - Velocidade: ${CaptalvoHardwareProfiler.profile.disk.speedMBps} MB/s (Escrita: ${CaptalvoHardwareProfiler.profile.disk.writeMs}ms, Leitura: ${CaptalvoHardwareProfiler.profile.disk.readMs}ms)`, 'log-ok');
                break;

            case 'sendlogs':
            case 'synclogs':
            case 'sync':
            case 'telemetry':
                this.write('Enviando logs acumulados para o servidor...', 'log-warn');
                await TelemetryManager.flush();
                this.write(`[Telemetry] Logs sincronizados com o servidor com sucesso! ID da Sessão: ${TelemetryManager.sessionId}`, 'log-ok');
                break;

            case 'copy':
                this.copyToClipboard();
                break;

            case 'status':
                const fps = document.getElementById('game-fps-counter').textContent;
                this.write(`STATUS: JogoRodando=${AppState.isGameRunning} | FPS=${fps} | OPFS=${AppState.installedFiles.size} arquivos | Backend=${AppState.backendHealthy ? 'Online' : 'Falha'}`, 'log-ok');
                break;

            case 'diag':
                this.write('Executando diagnóstico do sistema...', 'log-warn');
                const d = await CaptalvoDiagnostics.runFullDiagnostics();
                this.write(`GPU: ${d.gpu.renderer} (${d.gpu.vendor})
WASM: Suportado=${d.wasm.supported} | SAB=${d.wasm.sab} | COI=${d.wasm.coi}
ÁUDIO: ${d.audio.state} (${d.audio.sampleRate})
VFS: ${d.storage.driver} com ${d.storage.fileCount} arquivos
API: ${d.net.php} - Latência: ${d.net.latency}`, 'log-ok');
                break;

            case 'gpu':
                const gpu = await CaptalvoDiagnostics.getGpuInfo();
                this.write(`GPU / WebGL2:
  API: ${gpu.api}
  Fabricante: ${gpu.vendor}
  Renderizador: ${gpu.renderer}
  Textura Máx: ${gpu.maxTextureSize}px`, 'log-ok');
                break;

            case 'vfs':
                this.write(`Arquivos .BIG armazenados (${AppState.installedFiles.size}):`);
                for (const item of REQUIRED_ASSETS) {
                    const found = AppState.installedFiles.has(item.name) || AppState.installedFiles.has(item.name.toLowerCase());
                    this.write(`  [${found ? 'OK' : 'MISSING'}] ${item.name} (${item.desc})`, found ? 'log-ok' : 'log-err');
                }
                break;

            case 'audio':
                const aud = CaptalvoDiagnostics.getAudioInfo();
                this.write(`Áudio: Estado=${aud.state} | SampleRate=${aud.sampleRate}`, 'log-ok');
                break;

            case 'mem':
                const mem = CaptalvoDiagnostics.getMemoryInfo();
                this.write(`Memória: Heap WASM=${mem.wasmHeap} | Heap JS=${mem.jsHeap}`, 'log-ok');
                break;

            case 'fps':
                if (args[0]) {
                    const limit = parseInt(args[0], 10);
                    localStorage.setItem('captalvo_fps', String(limit));
                    document.getElementById('setting-fps').value = String(limit);
                    this.write(`Limitador de FPS ajustado para: ${limit}`, 'log-ok');
                } else {
                    const cur = localStorage.getItem('captalvo_fps') || '60';
                    this.write(`Limite atual de FPS: ${cur}`);
                }
                break;

            case 'ping':
                this.write('Enviando requisição de ping para https://captalvo.online/api/health...');
                const net = await CaptalvoDiagnostics.getNetworkInfo();
                this.write(`Resposta da API: ${net.php} em ${net.latency}`, net.status === 'ok' ? 'log-ok' : 'log-err');
                break;

            case 'cursor':
                if (document.exitPointerLock) document.exitPointerLock();
                this.write('Ponteiro liberado com sucesso.', 'log-ok');
                break;

            case 'capture':
                const canvas = document.getElementById('canvas');
                if (canvas) {
                    try {
                        const url = canvas.toDataURL('image/png');
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `captalvo-capture-${Date.now()}.png`;
                        a.click();
                        this.write(`Screenshot capturada (${canvas.width}x${canvas.height}).`, 'log-ok');
                    } catch (e) {
                        this.write('Erro capturando canvas: ' + e.message, 'log-err');
                    }
                }
                break;

            case 'clear':
                this.output.innerHTML = '';
                break;

            case 'reload':
                location.reload();
                break;

            case 'close':
                this.close();
                break;

            default:
                this.write(`Comando não reconhecido: "${cmd}". Digite "help" para ver as opções.`, 'log-err');
        }
    }
};

function initDevConsole() {
    DevConsole.init();

    // Capture global uncaught errors into DevConsole & Remote Telemetry
    window.addEventListener('error', (event) => {
        const msg = `[JS Error] ${event.message} (${event.filename || 'unknown'}:${event.lineno || 0})`;
        if (DevConsole && DevConsole.write) {
            DevConsole.write(msg, 'log-err');
        }
        if (TelemetryManager && TelemetryManager.log) {
            TelemetryManager.log('error', 'uncaught_error', event.message, {
                file: event.filename,
                line: event.lineno,
                col: event.colno,
                stack: event.error ? event.error.stack : null
            });
        }
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason ? (event.reason.message || event.reason.stack || String(event.reason)) : 'Erro desconhecido';
        if (DevConsole && DevConsole.write) {
            DevConsole.write(`[Promise Rejection] ${reason}`, 'log-err');
        }
        if (TelemetryManager && TelemetryManager.log) {
            TelemetryManager.log('error', 'unhandled_rejection', reason, {
                stack: event.reason && event.reason.stack ? event.reason.stack : null
            });
        }
    });

    // Mirror console.error & console.warn
    const origError = console.error.bind(console);
    console.error = function(...args) {
        origError(...args);
        try {
            const text = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
            if (DevConsole && DevConsole.write) {
                DevConsole.write(`[Error] ${text}`, 'log-err');
            }
            if (TelemetryManager && TelemetryManager.log) {
                TelemetryManager.log('error', 'console_error', text);
            }
        } catch (e) {}
    };

    const origWarn = console.warn.bind(console);
    console.warn = function(...args) {
        origWarn(...args);
        try {
            const text = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
            if (DevConsole && DevConsole.write) {
                DevConsole.write(`[Warn] ${text}`, 'log-warn');
            }
            if (TelemetryManager && TelemetryManager.log) {
                TelemetryManager.log('warn', 'console_warn', text);
            }
        } catch (e) {}
    };
}

// =============================================================================
// FPS MONITOR HUD (Integrated into AfterburnerManager)
// =============================================================================
function initFpsMonitor() {
    // Managed with sub-millisecond precision by AfterburnerManager
}

